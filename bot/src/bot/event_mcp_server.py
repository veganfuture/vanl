from __future__ import annotations

import base64
from datetime import datetime
from typing import Any
from uuid import UUID

from loguru import logger
from mcp.server.mcpserver import MCPServer
from pydantic import BaseModel

from bot.archive_db import ArchiveDb, ArchivedMessage
from bot.event_web_client import EventJson, EventRequest, EventWebClient
from bot.signal_cli import SignalClient

"""
The MCP server event_review_feature.py drives during each periodic run - see
the Signal ingestion plan. Two tool groups:

- Generic archive tools (list_group_messages, get_attachment_image,
  list_watched_groups): read bot_archived_* via ArchiveDb. Deliberately not
  event-specific, so a future feature (e.g. a newsletter digest) can reuse
  them without touching this file's event-specific half.
- Event tools (find_matching_event, resolve_place, create_event_draft,
  update_event_draft, set_event_flyer, mark_message_reviewed,
  notify_admin_group): call the website's public API as the signal-bot
  account (EventWebClient) and/or Signal (SignalClient.send_group_message).

Bookkeeping writes (ArchiveDb.mark_processed/record_notification) happen
inside the relevant tool handler, right after its external action succeeds -
not accumulated and flushed later - so a crash mid-run never loses
bookkeeping for an action that already durably happened. See the plan's
"State ownership, idempotency & duplicate avoidance" section.

Run standalone (`python -m bot.event_mcp_server`) for local/manual use (e.g.
pointing Claude Desktop at it for an ad-hoc "summarize last week" query) or
spawned as a stdio subprocess by event_review_feature.py once per periodic
run - either way it's the same server, no separate deployment.
"""


class EventDraftFields(BaseModel):
    title_nl: str | None = None
    title_en: str | None = None
    description_nl: str | None = None
    description_en: str | None = None
    start_at_iso: str
    start_time_known: bool = True
    end_at_iso: str | None = None
    end_time_known: bool = True
    place_id: str
    location_description: str
    map_url: str | None = None
    external_event_url: str | None = None
    registration_url: str | None = None

    def to_event_request(self, *, status: str | None) -> EventRequest:
        return EventRequest(
            titleNl=self.title_nl,
            titleEn=self.title_en,
            descriptionNl=self.description_nl,
            descriptionEn=self.description_en,
            startAt=self.start_at_iso,
            startTimeKnown=self.start_time_known,
            endAt=self.end_at_iso,
            endTimeKnown=self.end_time_known,
            locationKind="meeting_point_city_only",
            placeId=self.place_id,
            locationDescription=self.location_description,
            mapUrl=self.map_url,
            externalEventUrl=self.external_event_url,
            registrationUrl=self.registration_url,
            status=status,  # type: ignore[arg-type]
        )


class EventMcpServer:
    def __init__(
        self,
        *,
        db: ArchiveDb,
        web: EventWebClient,
        signal_client: SignalClient,
        admin_group_id: str,
        website_base_url: str,
        watched_groups: list[str],
    ) -> None:
        self.db = db
        self.web = web
        self.signal_client = signal_client
        self.admin_group_id = admin_group_id
        self.website_base_url = website_base_url.rstrip("/")
        self.watched_groups = watched_groups
        self.server: MCPServer[None] = MCPServer(name="vanl-signal-archive")
        self._register_tools()

    def _register_tools(self) -> None:
        self.server.tool()(self.list_group_messages)
        self.server.tool()(self.get_attachment_image)
        self.server.tool()(self.list_watched_groups)
        self.server.tool()(self.find_matching_event)
        self.server.tool()(self.resolve_place)
        self.server.tool()(self.create_event_draft)
        self.server.tool()(self.update_event_draft)
        self.server.tool()(self.set_event_flyer)
        self.server.tool()(self.mark_message_reviewed)
        self.server.tool()(self.notify_admin_group)

    async def run_stdio(self) -> None:
        logger.info(
            "event_mcp_server: starting (admin_group_id={}, watched_groups={})",
            self.admin_group_id,
            self.watched_groups,
        )
        await self.server.run_stdio_async()

    # --- Generic archive tools ---

    async def list_group_messages(
        self, group_name: str, since_iso: str, until_iso: str
    ) -> list[dict[str, Any]]:
        """
        List every archived message in `group_name` between `since_iso` and
        `until_iso` (ISO 8601 datetimes), unclipped by the 10-minute action
        buffer - use this for context even on messages too fresh to act on.
        """
        messages = await self.db.list_group_messages(
            group_name=group_name,
            since=datetime.fromisoformat(since_iso),
            until=datetime.fromisoformat(until_iso),
        )
        return [_message_to_dict(m) for m in messages]

    async def get_attachment_image(self, attachment_id: str) -> dict[str, Any]:
        """
        Fetch an attachment's image bytes (base64-encoded) so you can look
        at it directly - the primary source of event detail for flyer-only
        posts that carry no descriptive text at all.
        """
        stored = await self.db.get_attachment_bytes(attachment_id)
        if stored is None:
            return {"error": f"attachment {attachment_id} not found"}
        return {
            "content_type": stored.content_type,
            "base64_data": base64.b64encode(stored.bytes_).decode("ascii"),
        }

    async def list_watched_groups(self) -> list[str]:
        """List every Signal group name currently being archived."""
        return list(self.watched_groups)

    # --- Event tools ---

    async def find_matching_event(self) -> list[dict[str, Any]]:
        """
        List candidate events to check a new message against - both the
        bot's own past drafts/events (any status) and every other
        currently-visible event on the calendar, merged and deduplicated.
        Checking only the bot's own history isn't enough: a human may
        already have manually published the same event, or it may already
        exist via the ARC feed import. Decide whether a message describes
        an update to one of these, or a genuinely new event, yourself -
        this tool does not do any matching itself.
        """
        mine = await self.web.list_my_events()
        visible = await self.web.list_visible_events()
        by_id: dict[str, EventJson] = {}
        for event in [*mine, *visible]:
            by_id[event.id] = event
        return [_event_to_dict(event) for event in by_id.values()]

    async def resolve_place(self, city_name: str) -> list[dict[str, Any]]:
        """Resolve a free-text city/town name to a placeId - required before create_event_draft/update_event_draft."""
        places = await self.web.search_places(city_name)
        return [p.model_dump(by_alias=True) for p in places]

    async def create_event_draft(
        self, source_message_ids: list[str], fields: EventDraftFields
    ) -> dict[str, Any]:
        """
        Create a new draft event for a genuinely new event announcement.
        Marks every message in source_message_ids as processed against the
        new event's id - include any message (even one younger than the
        10-minute action buffer) you used as decisive context, not just the
        one eligible message that triggered this run.
        """
        event = await self.web.create_event(fields.to_event_request(status="draft"))
        await self.db.mark_processed(
            message_ids=source_message_ids, matched_event_id=_to_uuid(event.id)
        )
        return {**_event_to_dict(event), "edit_url": self._edit_url(event)}

    async def update_event_draft(
        self, event_id: str, source_message_ids: list[str], fields: EventDraftFields
    ) -> dict[str, Any]:
        """
        Update an event found via find_matching_event with new information
        from a follow-up message (a correction, a time/location change, a
        cancellation-worthy detail). Never change status here - publishing
        remains a human admin's action.
        """
        event = await self.web.update_event(
            event_id, fields.to_event_request(status=None)
        )
        await self.db.mark_processed(
            message_ids=source_message_ids, matched_event_id=_to_uuid(event.id)
        )
        return {**_event_to_dict(event), "edit_url": self._edit_url(event)}

    async def set_event_flyer(
        self, event_id: str, attachment_id: str
    ) -> dict[str, Any]:
        """Attach an already-archived flyer image (by attachment_id, from a message's attachment_ids) to an event."""
        stored = await self.db.get_attachment_bytes(attachment_id)
        if stored is None:
            return {"error": f"attachment {attachment_id} not found"}
        event = await self.web.upload_flyer(
            event_id,
            content_type=stored.content_type or "application/octet-stream",
            data=stored.bytes_,
        )
        return _event_to_dict(event)

    async def mark_message_reviewed(
        self, message_ids: list[str], reason: str
    ) -> dict[str, Any]:
        """
        Mark messages as reviewed without creating/updating an event -
        use when a message is examined and correctly judged not to describe
        an event (off-topic chatter, a question, etc.). Without this,
        ignored messages would be re-read on every future run forever.
        """
        await self.db.mark_processed(message_ids=message_ids, matched_event_id=None)
        return {"marked_reviewed": message_ids, "reason": reason}

    async def notify_admin_group(
        self, event_id: str, summary_text: str
    ) -> dict[str, Any]:
        """
        Post summary_text to the admins group. Skipped (no message sent) if
        it's identical to the last thing said about this event_id - always
        call this after create_event_draft/update_event_draft rather than
        deciding yourself whether anything changed; the dedup check lives
        here. Phrase updates as diffs ("time moved from 14:00 to 15:00"),
        not a generic "an event was updated".
        """
        event_uuid = _to_uuid(event_id)
        last = await self.db.get_last_notification(event_uuid)
        if last == summary_text:
            return {"sent": False, "reason": "unchanged since last notification"}
        await self.signal_client.send_group_message(self.admin_group_id, summary_text)
        await self.db.record_notification(
            event_id=event_uuid, summary_text=summary_text
        )
        return {"sent": True}

    def _edit_url(self, event: EventJson) -> str:
        return f"{self.website_base_url}/en/events/{event.slug}/edit"


def _message_to_dict(message: ArchivedMessage) -> dict[str, Any]:
    return {
        "message_id": message.message_id,
        "sender_name": message.sender_name,
        "sender_aci": message.sender_aci,
        "text": message.message_text,
        "received_at": message.received_at.isoformat(),
        "attachment_ids": message.attachment_ids,
        "already_processed": message.processed_at is not None,
    }


def _event_to_dict(event: EventJson) -> dict[str, Any]:
    return {
        "id": event.id,
        "slug": event.slug,
        "title_nl": event.title_nl,
        "title_en": event.title_en,
        "start_at": event.start_at,
        "location_description": event.location_description,
        "status": event.status,
        "source": event.source,
    }


def _to_uuid(value: str) -> UUID:
    return UUID(value)
