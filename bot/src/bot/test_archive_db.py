from __future__ import annotations

import os
import unittest
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from bot.archive_db import ArchiveDb

_DB_PORT = os.environ.get("VANL_DB_PORT")

# vanl_bot deliberately has no DELETE grant on its own tables (see
# migrations/0012_bot_archive.sql) - archived history is append/update-only,
# pruning is an out-of-band operator action, not something the bot itself
# does. So tests use a fresh random group_name per test instead of deleting
# fixture rows between runs.


@unittest.skipUnless(
    _DB_PORT,
    "requires a dev Postgres with migrations/0012_bot_archive.sql applied - "
    "set VANL_DB_PORT (see the website's local dev recipe)",
)
class ArchiveDbTests(unittest.IsolatedAsyncioTestCase):
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

    async def asyncTearDown(self) -> None:
        await self.db.close()

    async def test_insert_and_list_actionable_messages(self) -> None:
        now = datetime.now(UTC)
        old_enough = now - timedelta(minutes=20)
        too_recent = now - timedelta(minutes=1)

        await self.db.insert_message(
            message_id=f"sender-a:{uuid4().hex}",
            group_id=self.group_name,
            group_name=self.group_name,
            sender_aci="11111111-1111-1111-1111-111111111111",
            sender_name="Alex",
            message_text="Cube of Truth this Saturday, Amsterdam",
            raw_envelope={"envelope": {"timestamp": 1000}},
            received_at=old_enough,
        )
        fresh_message_id = f"sender-b:{uuid4().hex}"
        await self.db.insert_message(
            message_id=fresh_message_id,
            group_id=self.group_name,
            group_name=self.group_name,
            sender_aci="22222222-2222-2222-2222-222222222222",
            sender_name="Bo",
            message_text="too fresh to act on yet",
            raw_envelope={"envelope": {"timestamp": 2000}},
            received_at=too_recent,
        )

        actionable = await self.db.list_actionable_messages(
            group_name=self.group_name,
            older_than=now - timedelta(minutes=10),
        )

        self.assertEqual(len(actionable), 1)
        self.assertEqual(actionable[0].sender_name, "Alex")
        self.assertIsNone(actionable[0].processed_at)
        self.assertEqual(actionable[0].attempts, 0)
        self.assertNotIn(fresh_message_id, [m.message_id for m in actionable])

    async def test_list_group_messages_is_not_clipped_by_the_action_buffer(
        self,
    ) -> None:
        now = datetime.now(UTC)
        await self.db.insert_message(
            message_id=f"sender-b:{uuid4().hex}",
            group_id=self.group_name,
            group_name=self.group_name,
            sender_aci="22222222-2222-2222-2222-222222222222",
            sender_name="Bo",
            message_text="posted a moment ago",
            raw_envelope={},
            received_at=now - timedelta(minutes=1),
        )

        context = await self.db.list_group_messages(
            group_name=self.group_name,
            since=now - timedelta(hours=1),
            until=now,
        )

        self.assertEqual(len(context), 1)
        self.assertEqual(context[0].message_text, "posted a moment ago")

    async def test_insert_message_is_idempotent_on_message_id(self) -> None:
        now = datetime.now(UTC) - timedelta(minutes=20)
        message_id = f"sender-a:{uuid4().hex}"
        first_id = await self.db.insert_message(
            message_id=message_id,
            group_id=self.group_name,
            group_name=self.group_name,
            sender_aci="11111111-1111-1111-1111-111111111111",
            sender_name="Alex",
            message_text="hello",
            raw_envelope={},
            received_at=now,
        )
        second_id = await self.db.insert_message(
            message_id=message_id,
            group_id=self.group_name,
            group_name=self.group_name,
            sender_aci="11111111-1111-1111-1111-111111111111",
            sender_name="Alex",
            message_text="hello",
            raw_envelope={},
            received_at=now,
        )
        self.assertEqual(first_id, second_id)

    async def test_mark_processed_removes_message_from_actionable_list(self) -> None:
        now = datetime.now(UTC) - timedelta(minutes=20)
        message_id = f"sender-a:{uuid4().hex}"
        await self.db.insert_message(
            message_id=message_id,
            group_id=self.group_name,
            group_name=self.group_name,
            sender_aci="11111111-1111-1111-1111-111111111111",
            sender_name="Alex",
            message_text="hello",
            raw_envelope={},
            received_at=now,
        )

        await self.db.mark_processed(message_ids=[message_id], matched_event_id=None)

        actionable = await self.db.list_actionable_messages(
            group_name=self.group_name,
            older_than=datetime.now(UTC),
        )
        self.assertEqual(actionable, [])

    async def test_bump_attempts_increments_the_counter(self) -> None:
        now = datetime.now(UTC) - timedelta(minutes=20)
        message_id = f"sender-a:{uuid4().hex}"
        await self.db.insert_message(
            message_id=message_id,
            group_id=self.group_name,
            group_name=self.group_name,
            sender_aci="11111111-1111-1111-1111-111111111111",
            sender_name="Alex",
            message_text="hello",
            raw_envelope={},
            received_at=now,
        )

        await self.db.bump_attempts(message_ids=[message_id])
        await self.db.bump_attempts(message_ids=[message_id])

        actionable = await self.db.list_actionable_messages(
            group_name=self.group_name, older_than=datetime.now(UTC)
        )
        self.assertEqual(actionable[0].attempts, 2)

    async def test_notification_dedup_round_trip(self) -> None:
        event_id = uuid4()
        self.assertIsNone(await self.db.get_last_notification(event_id))

        await self.db.record_notification(
            event_id=event_id, summary_text="New event: Cube of Truth"
        )
        self.assertEqual(
            await self.db.get_last_notification(event_id), "New event: Cube of Truth"
        )

        await self.db.record_notification(
            event_id=event_id, summary_text="Updated: time moved to 15:00"
        )
        self.assertEqual(
            await self.db.get_last_notification(event_id),
            "Updated: time moved to 15:00",
        )

    async def test_attachment_round_trip(self) -> None:
        now = datetime.now(UTC) - timedelta(minutes=20)
        message_id = f"sender-a:{uuid4().hex}"
        row_id = await self.db.insert_message(
            message_id=message_id,
            group_id=self.group_name,
            group_name=self.group_name,
            sender_aci="11111111-1111-1111-1111-111111111111",
            sender_name="Alex",
            message_text=None,
            raw_envelope={},
            received_at=now,
        )
        attachment_id = f"attachment-{uuid4().hex}"

        await self.db.insert_attachment(
            attachment_id=attachment_id,
            message_row_id=row_id,
            content_type="image/jpeg",
            data=b"fake-flyer-bytes",
        )

        stored = await self.db.get_attachment_bytes(attachment_id)
        assert stored is not None
        self.assertEqual(stored.bytes_, b"fake-flyer-bytes")
        self.assertEqual(stored.content_type, "image/jpeg")

        actionable = await self.db.list_actionable_messages(
            group_name=self.group_name, older_than=datetime.now(UTC)
        )
        self.assertEqual(actionable[0].attachment_ids, [attachment_id])
