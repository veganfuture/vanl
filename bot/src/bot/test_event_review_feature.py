from __future__ import annotations

import os
import unittest
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import httpx

from bot.__test__.mock_signal_client import MockSignalClient
from bot.archive_db import ArchiveDb
from bot.config import EventReviewFeatureConfig
from bot.event_mcp_server import EventMcpServer
from bot.event_review_feature import EventReviewFeature
from bot.event_web_client import EventWebClient

_DB_PORT = os.environ.get("VANL_DB_PORT")


def _sample_event_json(event_id: str) -> dict[str, Any]:
    # A fresh random id per test run - bot_event_notifications rows persist
    # across test runs against the dev DB (vanl_bot has no DELETE grant, by
    # design - see migrations/0012_bot_archive.sql), so a fixed id here
    # would make notify_admin_group's dedup check see a stale "already
    # notified" row left over from a previous run of this same test.
    return {
        "id": event_id,
        "slug": "cube-of-truth-amsterdam",
        "titleNl": None,
        "titleEn": "Cube of Truth",
        "descriptionNl": None,
        "descriptionEn": "Join us",
        "startAt": "2026-10-01T13:00:00.000Z",
        "startTimeKnown": True,
        "endAt": None,
        "endTimeKnown": True,
        "locationKind": "meeting_point_city_only",
        "placeId": "22222222-2222-2222-2222-222222222222",
        "locationDescription": "Dam square",
        "mapUrl": None,
        "externalEventUrl": None,
        "registrationUrl": None,
        "flyerFullImageId": None,
        "status": "draft",
        "statusReason": None,
        "source": "manual",
    }


def _text_block(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _tool_use_block(
    tool_use_id: str, name: str, input_: dict[str, Any]
) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", id=tool_use_id, name=name, input=input_)


class FakeAnthropicClient:
    """
    Scripted stand-in for anthropic.AsyncAnthropic().messages - returns each
    entry of `responses` in order, one per .create() call, and records every
    call's kwargs so tests can assert on what was sent (e.g. that an image
    tool result became a real image content block).
    """

    def __init__(self, responses: list[SimpleNamespace]) -> None:
        self._responses = list(responses)
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> SimpleNamespace:
        # `messages` is the same list object every call (event_review_feature
        # mutates it in place across turns) - snapshot it now, or every
        # entry in self.calls would end up aliasing the final conversation
        # state instead of what was actually sent on that turn.
        self.calls.append({**kwargs, "messages": list(kwargs["messages"])})
        return self._responses.pop(0)


@unittest.skipUnless(
    _DB_PORT,
    "requires a dev Postgres with migrations/0012_bot_archive.sql applied - "
    "set VANL_DB_PORT (see the website's local dev recipe)",
)
class EventReviewFeatureTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        assert _DB_PORT is not None
        self.db = await ArchiveDb.connect(
            host="127.0.0.1",
            port=int(_DB_PORT),
            database="vanl_dev",
            user="vanl_bot",
            password=os.environ.get("VANL_BOT_DATABASE_PASSWORD", "dev-only-password"),
        )
        self.group_name = f"events-group-{uuid4().hex}"
        self.admin_group_id = f"admin-group-{uuid4().hex}"
        # A fresh id per test instance - bot_archived_attachments.attachment_id
        # is a primary key that persists across test runs against the dev DB
        # (vanl_bot has no DELETE grant, by design), so a fixed "flyer-1"
        # would risk colliding with a stale row from a previous run.
        self.attachment_id = f"flyer-{uuid4().hex}"
        self.signal_client = MockSignalClient(
            payload_batches=[], attachments={self.attachment_id: b"fake-flyer-bytes"}
        )

    async def asyncTearDown(self) -> None:
        await self.db.close()

    def _feature(
        self, *, responses: list[SimpleNamespace], transport_handler: Any
    ) -> tuple[EventReviewFeature, FakeAnthropicClient]:
        web = EventWebClient(
            base_url="https://veganactivists.nl",
            api_token="test-token",
            transport=httpx.MockTransport(transport_handler),
        )
        mcp_server = EventMcpServer(
            db=self.db,
            web=web,
            signal_client=self.signal_client,
            admin_group_id=self.admin_group_id,
            website_base_url="https://veganactivists.nl",
            watched_groups=[self.group_name],
        )
        fake_anthropic = FakeAnthropicClient(responses)
        config = EventReviewFeatureConfig(
            events_group_name=self.group_name,
            admin_group_name="Admins - Vegan Activists NL",
            website_base_url="https://veganactivists.nl",
            anthropic_model="claude-sonnet-5",
        )
        return EventReviewFeature(config, mcp_server, fake_anthropic), fake_anthropic

    async def _archive_old_message(
        self, *, text: str | None, attachment_id: str | None = None
    ):
        message_id = f"sender-a:{uuid4().hex}"
        row_id = await self.db.insert_message(
            message_id=message_id,
            group_id=self.group_name,
            group_name=self.group_name,
            sender_aci="11111111-1111-1111-1111-111111111111",
            sender_name="Alex",
            message_text=text,
            raw_envelope={},
            received_at=datetime.now(UTC) - timedelta(minutes=20),
        )
        if attachment_id is not None:
            await self.db.insert_attachment(
                attachment_id=attachment_id,
                message_row_id=row_id,
                content_type="image/jpeg",
                data=b"fake-flyer-bytes",
            )
        return message_id

    async def test_no_eligible_messages_never_calls_the_model(self) -> None:
        feature, fake_anthropic = self._feature(
            responses=[], transport_handler=lambda r: httpx.Response(500)
        )
        await feature.run_review()
        self.assertEqual(fake_anthropic.calls, [])

    async def test_mark_message_reviewed_leaves_it_processed_with_no_matched_event(
        self,
    ) -> None:
        message_id = await self._archive_old_message(text="anyone up for coffee later?")
        feature, _ = self._feature(
            responses=[
                SimpleNamespace(
                    stop_reason="tool_use",
                    content=[
                        _tool_use_block(
                            "t1",
                            "mark_message_reviewed",
                            {"message_ids": [message_id], "reason": "not an event"},
                        )
                    ],
                ),
                SimpleNamespace(stop_reason="end_turn", content=[_text_block("done")]),
            ],
            transport_handler=lambda r: httpx.Response(500),
        )

        await feature.run_review()

        remaining = await self.db.list_actionable_messages(
            group_name=self.group_name, older_than=datetime.now(UTC)
        )
        self.assertEqual(remaining, [])

    async def test_creating_a_draft_notifies_the_admin_group_and_marks_processed(
        self,
    ) -> None:
        message_id = await self._archive_old_message(
            text="Cube of Truth this Saturday, Amsterdam"
        )
        event_id = str(uuid4())

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/api/events" and request.method == "GET":
                return httpx.Response(200, json={"events": []})
            if request.url.path == "/api/events/mine":
                return httpx.Response(200, json={"events": []})
            if request.url.path == "/api/events" and request.method == "POST":
                return httpx.Response(201, json=_sample_event_json(event_id))
            raise AssertionError(f"unexpected request: {request.method} {request.url}")

        feature, _ = self._feature(
            responses=[
                SimpleNamespace(
                    stop_reason="tool_use",
                    content=[_tool_use_block("t1", "find_matching_event", {})],
                ),
                SimpleNamespace(
                    stop_reason="tool_use",
                    content=[
                        _tool_use_block(
                            "t2",
                            "create_event_draft",
                            {
                                "source_message_ids": [message_id],
                                "fields": {
                                    "title_en": "Cube of Truth",
                                    "start_at_iso": "2026-10-01T13:00:00+00:00",
                                    "place_id": "22222222-2222-2222-2222-222222222222",
                                    "location_description": "Dam square, Amsterdam",
                                },
                            },
                        )
                    ],
                ),
                SimpleNamespace(
                    stop_reason="tool_use",
                    content=[
                        _tool_use_block(
                            "t3",
                            "notify_admin_group",
                            {
                                "event_id": event_id,
                                "summary_text": "New event: Cube of Truth, Amsterdam",
                            },
                        )
                    ],
                ),
                SimpleNamespace(stop_reason="end_turn", content=[_text_block("done")]),
            ],
            transport_handler=handler,
        )

        await feature.run_review()

        remaining = await self.db.list_actionable_messages(
            group_name=self.group_name, older_than=datetime.now(UTC)
        )
        self.assertEqual(remaining, [])
        self.assertEqual(
            self.signal_client.sent_messages,
            [(self.admin_group_id, "New event: Cube of Truth, Amsterdam")],
        )

    async def test_get_attachment_image_result_becomes_a_real_image_content_block(
        self,
    ) -> None:
        message_id = await self._archive_old_message(
            text=None, attachment_id=self.attachment_id
        )

        feature, fake_anthropic = self._feature(
            responses=[
                SimpleNamespace(
                    stop_reason="tool_use",
                    content=[
                        _tool_use_block(
                            "t1",
                            "get_attachment_image",
                            {"attachment_id": self.attachment_id},
                        )
                    ],
                ),
                SimpleNamespace(
                    stop_reason="tool_use",
                    content=[
                        _tool_use_block(
                            "t2",
                            "mark_message_reviewed",
                            {"message_ids": [message_id], "reason": "test - stop here"},
                        )
                    ],
                ),
                SimpleNamespace(stop_reason="end_turn", content=[_text_block("done")]),
            ],
            transport_handler=lambda r: httpx.Response(500),
        )

        await feature.run_review()

        # The second .create() call's conversation includes the tool_result
        # for the get_attachment_image call from the first turn - assert it
        # was translated into a real image content block, not just raw JSON
        # text the model would otherwise have to parse itself.
        second_call_messages = fake_anthropic.calls[1]["messages"]
        tool_result_message = second_call_messages[-1]
        tool_result_content = tool_result_message["content"][0]["content"]
        self.assertIsInstance(tool_result_content, list)
        image_blocks = [b for b in tool_result_content if b["type"] == "image"]
        self.assertEqual(len(image_blocks), 1)
        self.assertEqual(image_blocks[0]["source"]["media_type"], "image/jpeg")

    async def test_stops_after_max_agent_turns_without_crashing(self) -> None:
        message_id = await self._archive_old_message(text="loops forever")
        infinite_tool_use = SimpleNamespace(
            stop_reason="tool_use",
            content=[
                _tool_use_block("t", "find_matching_event", {}),
            ],
        )
        feature, fake_anthropic = self._feature(
            responses=[infinite_tool_use] * 100,
            transport_handler=lambda r: httpx.Response(200, json={"events": []}),
        )
        feature.config.max_agent_turns = 3

        await feature.run_review()

        self.assertEqual(len(fake_anthropic.calls), 3)
        # Never touched by mark_message_reviewed/create_event_draft, but the
        # run must still bump its attempts rather than silently stall.
        remaining = await self.db.list_actionable_messages(
            group_name=self.group_name, older_than=datetime.now(UTC)
        )
        self.assertEqual(remaining[0].message_id, message_id)
        self.assertEqual(remaining[0].attempts, 1)
