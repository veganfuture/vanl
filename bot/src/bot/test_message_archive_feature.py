from __future__ import annotations

import itertools
import os
import time
import unittest
from datetime import UTC, datetime
from uuid import uuid4

from bot.__test__.mock_signal_client import MockSignalClient
from bot.archive_db import ArchiveDb
from bot.config import MessageArchiveFeatureConfig
from bot.message_archive_feature import MessageArchiveFeature
from bot.signal_cli import (
    Attachment,
    DataMessage,
    Envelope,
    GroupInfo,
    SignalGroup,
    SignalPayload,
)

_DB_PORT = os.environ.get("VANL_DB_PORT")

# message_id is (sender_aci, timestamp) - real Signal message identity, with
# no group component (see message_archive_feature.py). bot_archived_messages
# rows persist across test runs against the dev DB (vanl_bot has no DELETE
# grant, by design), so a fixed timestamp constant here would silently
# collide with a row a previous run of this same test already inserted -
# insert_message's ON CONFLICT would then hand back that stale row instead
# of creating a new one. Every payload gets a fresh timestamp instead.
_next_timestamp = itertools.count(time.time_ns() // 1_000_000)


def _unique_timestamp() -> int:
    return next(_next_timestamp)


def _payload(
    *,
    group_id: str,
    sender_aci: str,
    timestamp: int,
    text: str | None,
    attachments: list[Attachment] | None = None,
) -> SignalPayload:
    return SignalPayload(
        envelope=Envelope(
            source=sender_aci,
            sourceUuid=sender_aci,
            sourceName="Alex",
            timestamp=timestamp,
            dataMessage=DataMessage(
                groupInfo=GroupInfo(groupId=group_id),
                message=text,
                attachments=attachments or [],
            ),
        )
    )


@unittest.skipUnless(
    _DB_PORT,
    "requires a dev Postgres with migrations/0012_bot_archive.sql applied - "
    "set VANL_DB_PORT (see the website's local dev recipe)",
)
class MessageArchiveFeatureTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        assert _DB_PORT is not None
        self.db = await ArchiveDb.connect(
            host="127.0.0.1",
            port=int(_DB_PORT),
            database="vanl_dev",
            user="vanl_bot",
            password=os.environ.get("VANL_BOT_DATABASE_PASSWORD", "dev-only-password"),
        )
        self.group_name = f"test-group-{uuid4().hex}"
        self.group_id = f"group-id-{uuid4().hex}"

    async def asyncTearDown(self) -> None:
        await self.db.close()

    def _feature(
        self, other_group_names: list[str] | None = None
    ) -> MessageArchiveFeature:
        client = MockSignalClient(
            payload_batches=[],
            groups=[SignalGroup(groupId=self.group_id, name=self.group_name)],
            attachments={"flyer-1": b"fake-flyer-bytes"},
        )
        config = MessageArchiveFeatureConfig(
            archived_groups=[self.group_name, *(other_group_names or [])],
        )
        return MessageArchiveFeature(config, client, self.db)

    async def test_archives_a_message_from_a_watched_group(self) -> None:
        feature = self._feature()
        await feature.setup()
        timestamp = _unique_timestamp()

        await feature.handle_payloads(
            [
                _payload(
                    group_id=self.group_id,
                    sender_aci="11111111-1111-1111-1111-111111111111",
                    timestamp=timestamp,
                    text="Cube of Truth this Saturday",
                )
            ],
            cycle_finished_at=0.0,
        )

        archived = await self.db.list_group_messages(
            group_name=self.group_name,
            since=datetime(2020, 1, 1, tzinfo=UTC),
            until=datetime.now(UTC),
        )
        self.assertEqual(len(archived), 1)
        self.assertEqual(archived[0].message_text, "Cube of Truth this Saturday")
        self.assertEqual(
            archived[0].message_id, f"11111111-1111-1111-1111-111111111111:{timestamp}"
        )
        self.assertEqual(archived[0].sender_name, "Alex")

    async def test_ignores_messages_from_unwatched_groups(self) -> None:
        feature = self._feature()
        await feature.setup()

        await feature.handle_payloads(
            [
                _payload(
                    group_id="some-other-group",
                    sender_aci="11111111-1111-1111-1111-111111111111",
                    timestamp=_unique_timestamp(),
                    text="unrelated chatter",
                )
            ],
            cycle_finished_at=0.0,
        )

        archived = await self.db.list_group_messages(
            group_name=self.group_name,
            since=datetime(2020, 1, 1, tzinfo=UTC),
            until=datetime.now(UTC),
        )
        self.assertEqual(archived, [])

    async def test_archives_attachments_alongside_the_message(self) -> None:
        # attachment_id is bot_archived_attachments' primary key, which
        # persists across test runs the same way message_id does (see the
        # _unique_timestamp comment above) - a fixed "flyer-1" here would
        # collide with a row a previous run already inserted for a
        # different message.
        attachment_id = f"flyer-{uuid4().hex}"
        client = MockSignalClient(
            payload_batches=[],
            groups=[SignalGroup(groupId=self.group_id, name=self.group_name)],
            attachments={attachment_id: b"fake-flyer-bytes"},
        )
        config = MessageArchiveFeatureConfig(archived_groups=[self.group_name])
        feature = MessageArchiveFeature(config, client, self.db)
        await feature.setup()

        await feature.handle_payloads(
            [
                _payload(
                    group_id=self.group_id,
                    sender_aci="11111111-1111-1111-1111-111111111111",
                    timestamp=_unique_timestamp(),
                    text=None,
                    attachments=[
                        Attachment(contentType="image/jpeg", id=attachment_id)
                    ],
                )
            ],
            cycle_finished_at=0.0,
        )

        archived = await self.db.list_group_messages(
            group_name=self.group_name,
            since=datetime(2020, 1, 1, tzinfo=UTC),
            until=datetime.now(UTC),
        )
        self.assertEqual(archived[0].attachment_ids, [attachment_id])
        stored = await self.db.get_attachment_bytes(attachment_id)
        assert stored is not None
        self.assertEqual(stored.bytes_, b"fake-flyer-bytes")

    async def test_skips_a_payload_with_no_resolvable_sender(self) -> None:
        feature = self._feature()
        await feature.setup()

        payload = SignalPayload(
            envelope=Envelope(
                timestamp=_unique_timestamp(),
                dataMessage=DataMessage(
                    groupInfo=GroupInfo(groupId=self.group_id), message="hi"
                ),
            )
        )

        # Must not raise - a malformed/edge-case payload is logged and
        # skipped, never allowed to crash the always-on receive loop.
        await feature.handle_payloads([payload], cycle_finished_at=0.0)
