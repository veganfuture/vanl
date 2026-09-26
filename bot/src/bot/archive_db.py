from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

import asyncpg
from pydantic import BaseModel


class ArchivedMessage(BaseModel):
    id: UUID
    message_id: str
    group_id: str
    group_name: str
    sender_aci: str
    sender_name: str | None
    message_text: str | None
    raw_envelope: dict[str, Any]
    received_at: datetime
    processed_at: datetime | None
    attempts: int
    matched_event_id: UUID | None
    attachment_ids: list[str] = []


class ArchivedAttachment(BaseModel):
    attachment_id: str
    content_type: str | None
    bytes_: bytes
    downloaded_at: datetime


class ArchiveDb:
    """
    Thin asyncpg wrapper around bot_archived_messages/bot_archived_attachments/
    bot_event_notifications (migrations/0012_bot_archive.sql) - the bot's own
    tables in the *website's* Postgres database, reached via the narrowly-
    scoped vanl_bot role (grants only on these three tables, nothing else -
    see the migration). One pool, shared by message_archive_feature.py
    (writes on every incoming message) and event_mcp_server.py (reads/writes
    during a periodic review run).

    Bookkeeping writes (mark_processed, record_notification) belong here,
    called from inside the MCP tool handlers that perform the corresponding
    external action - not accumulated in memory and flushed later - so a
    crash mid-run never loses a bookkeeping write for an action that already
    durably succeeded. See the Signal ingestion plan's "State ownership"
    section.
    """

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @staticmethod
    async def connect(
        *,
        host: str,
        port: int,
        database: str,
        user: str,
        password: str,
    ) -> ArchiveDb:
        pool = await asyncpg.create_pool(
            host=host,
            port=port,
            database=database,
            user=user,
            password=password,
            min_size=1,
            max_size=5,
        )
        return ArchiveDb(pool)

    async def close(self) -> None:
        await self._pool.close()

    async def insert_message(
        self,
        *,
        message_id: str,
        group_id: str,
        group_name: str,
        sender_aci: str,
        sender_name: str | None,
        message_text: str | None,
        raw_envelope: dict[str, Any],
        received_at: datetime,
    ) -> UUID:
        """
        Insert a captured message, idempotent on message_id (see the
        migration's unique constraint) - a redelivered `receive` event (e.g.
        after a reconnect) is silently deduped rather than double-archived.

        Returns: the row's internal uuid (existing or newly inserted)
        """
        row = await self._pool.fetchrow(
            """
            insert into bot_archived_messages
                (message_id, group_id, group_name, sender_aci, sender_name,
                 message_text, raw_envelope, received_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
            on conflict (message_id) do update set message_id = excluded.message_id
            returning id
            """,
            message_id,
            group_id,
            group_name,
            sender_aci,
            sender_name,
            message_text,
            json.dumps(raw_envelope),
            received_at,
        )
        assert row is not None
        return row["id"]

    async def insert_attachment(
        self,
        *,
        attachment_id: str,
        message_row_id: UUID,
        content_type: str | None,
        data: bytes,
    ) -> None:
        await self._pool.execute(
            """
            insert into bot_archived_attachments (attachment_id, message_id, content_type, bytes)
            values ($1, $2, $3, $4)
            on conflict (attachment_id) do nothing
            """,
            attachment_id,
            message_row_id,
            content_type,
            data,
        )

    async def list_actionable_messages(
        self, *, group_name: str, older_than: datetime, limit: int = 200
    ) -> list[ArchivedMessage]:
        """
        The periodic review pass's main query: unprocessed messages at least
        message_action_delay_seconds old (the self-correction buffer -
        event_review_feature.py computes older_than). Ordered oldest first.
        """
        rows = await self._pool.fetch(
            """
            select m.*, coalesce(array_agg(a.attachment_id) filter (where a.attachment_id is not null), '{}') as attachment_ids
            from bot_archived_messages m
            left join bot_archived_attachments a on a.message_id = m.id
            where m.group_name = $1 and m.processed_at is null and m.received_at <= $2
            group by m.id
            order by m.received_at asc
            limit $3
            """,
            group_name,
            older_than,
            limit,
        )
        return [_row_to_message(row) for row in rows]

    async def list_group_messages(
        self, *, group_name: str, since: datetime, until: datetime
    ) -> list[ArchivedMessage]:
        """
        Unclipped by the action buffer, unlike list_actionable_messages - the
        agent's context-reading tool (list_group_messages MCP tool) can and
        should see everything up to `until`, even messages too fresh to act
        on yet.
        """
        rows = await self._pool.fetch(
            """
            select m.*, coalesce(array_agg(a.attachment_id) filter (where a.attachment_id is not null), '{}') as attachment_ids
            from bot_archived_messages m
            left join bot_archived_attachments a on a.message_id = m.id
            where m.group_name = $1 and m.received_at >= $2 and m.received_at <= $3
            group by m.id
            order by m.received_at asc
            """,
            group_name,
            since,
            until,
        )
        return [_row_to_message(row) for row in rows]

    async def get_attachment_bytes(
        self, attachment_id: str
    ) -> ArchivedAttachment | None:
        row = await self._pool.fetchrow(
            "select attachment_id, content_type, bytes, downloaded_at from bot_archived_attachments where attachment_id = $1",
            attachment_id,
        )
        if row is None:
            return None
        return ArchivedAttachment(
            attachment_id=row["attachment_id"],
            content_type=row["content_type"],
            bytes_=row["bytes"],
            downloaded_at=row["downloaded_at"],
        )

    async def mark_processed(
        self, *, message_ids: list[str], matched_event_id: UUID | None
    ) -> None:
        """
        Called from inside a write-tool handler (create_event_draft,
        update_event_draft, mark_message_reviewed) once its corresponding
        external action has already succeeded - see the class docstring.
        matched_event_id is null for "reviewed and correctly judged not to
        be an event" (mark_message_reviewed).
        """
        if not message_ids:
            return
        await self._pool.execute(
            """
            update bot_archived_messages
            set processed_at = now(), matched_event_id = $2
            where message_id = any($1::text[])
            """,
            message_ids,
            matched_event_id,
        )

    async def bump_attempts(self, *, message_ids: list[str]) -> None:
        """
        Called by event_review_feature.py after a run ends for whatever's
        still unprocessed - distinguishes "the agent hasn't gotten to this
        yet" from "genuinely failed repeatedly", bounding retries without
        the periodic feature itself deciding what counts as handled.
        """
        if not message_ids:
            return
        await self._pool.execute(
            "update bot_archived_messages set attempts = attempts + 1 where message_id = any($1::text[])",
            message_ids,
        )

    async def get_last_notification(self, event_id: UUID) -> str | None:
        row = await self._pool.fetchrow(
            "select last_summary_text from bot_event_notifications where event_id = $1",
            event_id,
        )
        return row["last_summary_text"] if row else None

    async def record_notification(self, *, event_id: UUID, summary_text: str) -> None:
        await self._pool.execute(
            """
            insert into bot_event_notifications (event_id, last_summary_text, last_notified_at)
            values ($1, $2, now())
            on conflict (event_id) do update
                set last_summary_text = excluded.last_summary_text, last_notified_at = now()
            """,
            event_id,
            summary_text,
        )


def _row_to_message(row: asyncpg.Record) -> ArchivedMessage:
    raw_envelope = row["raw_envelope"]
    return ArchivedMessage(
        id=row["id"],
        message_id=row["message_id"],
        group_id=row["group_id"],
        group_name=row["group_name"],
        sender_aci=row["sender_aci"],
        sender_name=row["sender_name"],
        message_text=row["message_text"],
        raw_envelope=json.loads(raw_envelope)
        if isinstance(raw_envelope, str)
        else raw_envelope,
        received_at=row["received_at"],
        processed_at=row["processed_at"],
        attempts=row["attempts"],
        matched_event_id=row["matched_event_id"],
        attachment_ids=list(row["attachment_ids"]),
    )
