from __future__ import annotations

import json
import time
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from loguru import logger
from mcp.types import InputRequiredResult, TextContent

from bot.config import EventReviewFeatureConfig
from bot.event_mcp_server import EventMcpServer
from bot.signal_cli import SignalPayload

_SYSTEM_PROMPT = """\
You review new messages from a Signal group where activists post events (and \
updates to events they already posted - corrections, time/location changes, \
cancellations). Your job: for each message, decide whether it describes a \
new event, an update to an event already on the calendar, or isn't about an \
event at all - then act using the tools available.

Rules:
- Many posts carry no descriptive text at all - the entire event is only on \
a flyer image. Call get_attachment_image for every attachment on every \
message before concluding there's nothing to act on. Read text off the \
image yourself; you do not need a separate OCR step.
- Before creating a new event, call find_matching_event and check whether \
this message is actually about something already on the calendar (your own \
past draft, or something a human already published, or an ARC import) - \
never create a duplicate.
- Before create_event_draft/update_event_draft, call resolve_place with the \
city/town name to get a placeId.
- Every event you create must have status left as draft (create_event_draft \
always does this) - never ask to publish; a human admin reviews and \
publishes.
- After create_event_draft or update_event_draft, always call \
notify_admin_group with a short human-readable summary. For an update, \
phrase it as a diff ("time moved from 14:00 to 15:00", "flyer replaced", \
"cancelled"), not a generic "an event was updated".
- If a message is not about an event (off-topic chatter, a question, \
banter), call mark_message_reviewed with a short reason instead of \
create_event_draft.
- Every message id you relied on to reach a conclusion - including ones \
younger than the eligibility cutoff that you used only as context - must be \
included in source_message_ids / message_ids when you finally act.
"""


class AnthropicMessagesClient(Protocol):
    """
    The one method of anthropic.AsyncAnthropic().messages this feature
    needs - a Protocol so tests can inject a scripted fake instead of a real
    API client, same reasoning as SignalClient being a Protocol.
    """

    async def create(self, **kwargs: Any) -> Any: ...


class AnthropicMessagesAdapter:
    """
    Wraps the real anthropic.AsyncAnthropic().messages resource to satisfy
    AnthropicMessagesClient - its actual .create is a heavily-overloaded,
    keyword-only method that doesn't structurally match a plain **kwargs
    Protocol, even though every call site here only ever uses it that way.
    """

    def __init__(self, messages: Any) -> None:
        self._messages = messages

    async def create(self, **kwargs: Any) -> Any:
        return await self._messages.create(**kwargs)


class EventReviewFeature:
    """
    The periodic half of Signal event ingestion (see message_archive_feature.py
    for the always-on capture half, and event_mcp_server.py for the tool
    surface this drives). Runs one Claude tool-use pass over unprocessed,
    eligible messages every review_interval_seconds - not per message, and
    not per Signal receive cycle - via EventMcpServer's registered tools,
    called in-process through the real MCPServer.call_tool machinery
    (schema validation included) rather than a spawned stdio subprocess of
    itself. event_mcp_server.py's standalone entrypoint is what makes the
    same tool surface independently attachable (e.g. from Claude Desktop for
    an ad hoc "summarize last week" query) - this feature is just one more
    caller of it, from inside the same process.
    """

    name = "event_review"

    def __init__(
        self,
        config: EventReviewFeatureConfig,
        mcp_server: EventMcpServer,
        anthropic_client: AnthropicMessagesClient,
    ) -> None:
        self.config = config
        self.mcp_server = mcp_server
        self.anthropic_client = anthropic_client
        self.last_review_ran_at = 0.0

    async def setup(self) -> None:
        self.last_review_ran_at = time.monotonic()

    async def handle_payloads(
        self, payloads: list[SignalPayload], cycle_finished_at: float
    ) -> None:
        # Purely periodic - see on_cycle. Capture already happened in
        # message_archive_feature.py; this feature never reacts to a
        # payload directly.
        del payloads, cycle_finished_at

    async def on_cycle(self, cycle_finished_at: float) -> None:
        if (
            cycle_finished_at - self.last_review_ran_at
            < self.config.review_interval_seconds
        ):
            return
        self.last_review_ran_at = cycle_finished_at
        await self.run_review()

    async def run_review(self) -> None:
        """
        Run one review pass now, regardless of the timer - the public entry
        point on_cycle uses internally, also useful for a manual/dev-time
        trigger (see the Signal ingestion plan's verification section).

        Returns: None
        """
        older_than = datetime.now(UTC) - timedelta(
            seconds=self.config.message_action_delay_seconds
        )
        messages = await self.mcp_server.db.list_actionable_messages(
            group_name=self.config.events_group_name, older_than=older_than
        )
        if not messages:
            return

        logger.info("event_review: {} eligible message(s) to review", len(messages))
        try:
            await self._drive_agent(messages_summary=_render_messages(messages))
        except Exception:
            logger.exception("event_review: agent run failed")

        # Whatever the agent didn't touch (declined, or the run failed
        # partway through) gets its attempts counter bumped rather than
        # being silently retried forever - see ArchiveDb.bump_attempts.
        still_unprocessed = await self.mcp_server.db.list_actionable_messages(
            group_name=self.config.events_group_name, older_than=older_than
        )
        if still_unprocessed:
            logger.info(
                "event_review: {} message(s) still unprocessed after this run",
                len(still_unprocessed),
            )
            await self.mcp_server.db.bump_attempts(
                message_ids=[m.message_id for m in still_unprocessed]
            )

    async def _drive_agent(self, *, messages_summary: str) -> None:
        tools = await self._anthropic_tool_specs()
        conversation: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": (
                    f"Group: {self.config.events_group_name}\n\n"
                    f"New messages to review (oldest first):\n\n{messages_summary}"
                ),
            }
        ]

        for turn in range(self.config.max_agent_turns):
            response = await self.anthropic_client.create(
                model=self.config.anthropic_model,
                max_tokens=4096,
                system=_SYSTEM_PROMPT,
                tools=tools,
                messages=conversation,
            )
            conversation.append({"role": "assistant", "content": response.content})
            if response.stop_reason != "tool_use":
                return

            tool_results: list[dict[str, Any]] = []
            for block in response.content:
                if getattr(block, "type", None) != "tool_use":
                    continue
                tool_results.append(await self._call_tool(block))
            conversation.append({"role": "user", "content": tool_results})

        logger.warning(
            "event_review: hit max_agent_turns ({}) without the model finishing",
            self.config.max_agent_turns,
        )

    async def _call_tool(self, block: Any) -> dict[str, Any]:
        logger.debug("event_review: calling tool {} with {}", block.name, block.input)
        result = await self.mcp_server.server.call_tool(block.name, block.input)
        if isinstance(result, InputRequiredResult):
            # None of this server's tools ever call ctx.elicit() - this
            # branch should be unreachable, but the return type covers it.
            raise RuntimeError(
                f"tool {block.name} unexpectedly requires additional input"
            )
        text = (
            "\n".join(
                item.text for item in result.content if isinstance(item, TextContent)
            )
            or "(no content)"
        )

        content: str | list[dict[str, Any]] = text
        if block.name == "get_attachment_image" and not result.is_error:
            content = _image_tool_result_content(text)

        return {
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": content,
            "is_error": result.is_error,
        }

    async def _anthropic_tool_specs(self) -> list[dict[str, Any]]:
        tools = await self.mcp_server.server.list_tools()
        return [
            {
                "name": t.name,
                "description": t.description or "",
                "input_schema": t.input_schema,
            }
            for t in tools
        ]


def _render_messages(messages: list[Any]) -> str:
    lines = []
    for m in messages:
        lines.append(
            f"- message_id={m.message_id} sender={m.sender_name or m.sender_aci} "
            f"received_at={m.received_at.isoformat()} "
            f"attachment_ids={m.attachment_ids} text={m.message_text!r}"
        )
    return "\n".join(lines)


def _image_tool_result_content(text: str) -> str | list[dict[str, Any]]:
    """Turns get_attachment_image's JSON text result into a real image content block, so the model actually sees the flyer instead of just a base64 string."""
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return text
    base64_data = parsed.get("base64_data")
    if not base64_data:
        return text
    return [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": parsed.get("content_type") or "image/jpeg",
                "data": base64_data,
            },
        },
        {"type": "text", "text": "Attachment image above."},
    ]
