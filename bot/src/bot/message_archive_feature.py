from __future__ import annotations

from datetime import UTC, datetime

from loguru import logger

from bot.archive_db import ArchiveDb
from bot.config import MessageArchiveFeatureConfig
from bot.signal_cli import SignalClient, SignalPayload


class MessageArchiveFeature:
    """
    Generic Signal-group message archive - not event-specific. Watches every
    group named in config.archived_groups and logs every message (text,
    sender, timestamp, attachments, and the full raw envelope) to Postgres
    via ArchiveDb. Pure capture: no LLM call, no decision-making about
    whether a message matters - that's event_review_feature.py's job,
    reading from the same archive. Keeping this feature ignorant of "events"
    entirely is deliberate, so the same archive is reusable by a future
    feature (e.g. a monthly newsletter digest) without touching this file.
    """

    name = "message_archive"

    def __init__(
        self,
        config: MessageArchiveFeatureConfig,
        client: SignalClient,
        db: ArchiveDb,
    ) -> None:
        self.config = config
        self.client = client
        self.db = db
        self._group_ids_by_name: dict[str, str] = {}

    async def setup(self) -> None:
        """
        Resolve every configured group name to its current group id.

        Returns: None
        """
        for group_name in self.config.archived_groups:
            group = await self.client.get_group_by_name(group_name)
            if group is None or group.resolved_id is None:
                logger.warning(
                    "message_archive: could not resolve group {!r} - messages "
                    "in it will not be archived until it's found on a later "
                    "startup",
                    group_name,
                )
                continue
            self._group_ids_by_name[group.resolved_id] = group_name
        logger.info(
            "message_archive: watching {} group(s): {}",
            len(self._group_ids_by_name),
            list(self._group_ids_by_name.values()),
        )

    async def handle_payloads(
        self,
        payloads: list[SignalPayload],
        cycle_finished_at: float,
    ) -> None:
        """
        Archive every message from a watched group.

        Args:
        - payloads - payloads returned by Signal
        - cycle_finished_at - monotonic timestamp for the end of the receive cycle (unused - captured wall-clock time comes from the message itself)

        Returns: None
        """
        del cycle_finished_at
        for payload in payloads:
            group_id = payload.extract_group_id()
            if group_id is None or group_id not in self._group_ids_by_name:
                continue
            await self._archive_payload(payload, self._group_ids_by_name[group_id])

    async def on_cycle(self, cycle_finished_at: float) -> None:
        del cycle_finished_at

    async def _archive_payload(self, payload: SignalPayload, group_name: str) -> None:
        envelope = payload.envelope
        if envelope is None:
            return
        sender_ids = payload.sender_ids()
        timestamp = payload.extract_timestamp()
        if not sender_ids or timestamp is None:
            logger.debug(
                "message_archive: skipping payload with no sender/timestamp: {}",
                payload.describe_event(),
            )
            return

        sender_aci = sender_ids[0]
        message_id = f"{sender_aci}:{timestamp}"
        group_id = payload.extract_group_id()
        assert group_id is not None

        try:
            row_id = await self.db.insert_message(
                message_id=message_id,
                group_id=group_id,
                group_name=group_name,
                sender_aci=sender_aci,
                sender_name=payload.sender_name(),
                message_text=payload.extract_message_text(),
                raw_envelope=envelope.model_dump(by_alias=True, mode="json"),
                received_at=_timestamp_to_datetime(timestamp),
            )
        except Exception:
            # A capture failure must never take down the always-on receive
            # loop for every other feature - log and move on, same
            # resilience principle as SignalBotRunner's own per-feature
            # try/except in bot.py.
            logger.exception(
                "message_archive: failed to archive message {} from group {}",
                message_id,
                group_name,
            )
            return

        for attachment in payload.extract_attachments():
            if attachment.id is None:
                continue
            try:
                data = await self.client.read_attachment_bytes(attachment.id)
                await self.db.insert_attachment(
                    attachment_id=attachment.id,
                    message_row_id=row_id,
                    content_type=attachment.content_type,
                    data=data,
                )
            except Exception:
                logger.exception(
                    "message_archive: failed to archive attachment {} for message {}",
                    attachment.id,
                    message_id,
                )


def _timestamp_to_datetime(timestamp_millis: int) -> datetime:
    return datetime.fromtimestamp(timestamp_millis / 1000, tz=UTC)
