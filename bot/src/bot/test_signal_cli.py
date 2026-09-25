from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from bot.signal_cli import (
    RateLimitExceededError,
    SignalRpcClient,
    _RecipientMessageRateLimiter,
)


class RecipientMessageRateLimiterTests(unittest.TestCase):
    def test_allows_sends_up_to_the_cap(self) -> None:
        limiter = _RecipientMessageRateLimiter(max_messages=3, window_seconds=60.0)

        for _ in range(3):
            limiter.check_and_record("+31600000000")

    def test_raises_once_the_cap_is_exceeded(self) -> None:
        limiter = _RecipientMessageRateLimiter(max_messages=3, window_seconds=60.0)
        for _ in range(3):
            limiter.check_and_record("+31600000000")

        with self.assertRaises(RateLimitExceededError) as ctx:
            limiter.check_and_record("+31600000000")

        self.assertEqual(ctx.exception.recipient, "+31600000000")

    def test_tracks_each_recipient_independently(self) -> None:
        limiter = _RecipientMessageRateLimiter(max_messages=1, window_seconds=60.0)

        limiter.check_and_record("recipient-a")
        limiter.check_and_record("recipient-b")  # must not raise - different recipient

        with self.assertRaises(RateLimitExceededError):
            limiter.check_and_record("recipient-a")

    def test_allows_sends_again_once_the_window_elapses(self) -> None:
        limiter = _RecipientMessageRateLimiter(max_messages=1, window_seconds=60.0)
        with patch("bot.signal_cli.time.monotonic", return_value=1000.0):
            limiter.check_and_record("recipient-a")

        with patch("bot.signal_cli.time.monotonic", return_value=1000.0 + 60.1):
            limiter.check_and_record("recipient-a")  # must not raise - window elapsed

    def test_logs_a_warning_when_the_cap_is_exceeded(self) -> None:
        limiter = _RecipientMessageRateLimiter(max_messages=1, window_seconds=60.0)
        limiter.check_and_record("recipient-a")

        with patch("bot.signal_cli.logger") as mock_logger:
            with self.assertRaises(RateLimitExceededError):
                limiter.check_and_record("recipient-a")

        mock_logger.warning.assert_called_once()


class SignalRpcClientRateLimitTests(unittest.IsolatedAsyncioTestCase):
    async def test_send_contact_message_is_blocked_without_reaching_the_socket(
        self,
    ) -> None:
        client = SignalRpcClient(
            socket_path=Path("/nonexistent.sock"),
            rate_limit_max_messages=1,
            rate_limit_window_seconds=60.0,
        )
        client._request = AsyncMock()  # type: ignore[method-assign]

        await client.send_contact_message("recipient-a", "hello")
        with self.assertRaises(RateLimitExceededError):
            await client.send_contact_message("recipient-a", "hello again")

        client._request.assert_awaited_once()

    async def test_send_group_message_is_blocked_without_reaching_the_socket(
        self,
    ) -> None:
        client = SignalRpcClient(
            socket_path=Path("/nonexistent.sock"),
            rate_limit_max_messages=1,
            rate_limit_window_seconds=60.0,
        )
        client._request = AsyncMock()  # type: ignore[method-assign]

        await client.send_group_message("group-a", "hello")
        with self.assertRaises(RateLimitExceededError):
            await client.send_group_message("group-a", "hello again")

        client._request.assert_awaited_once()
