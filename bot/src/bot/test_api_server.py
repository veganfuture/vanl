from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from bot.__test__.mock_signal_client import MockSignalClient
from bot.api_server import BotApiServer
from bot.bot_env import BotEnv
from bot.config import BotApiConfig


def _config() -> BotApiConfig:
    return BotApiConfig(
        host="127.0.0.1",
        port=8787,
        otp_message_template="Your Vegan Activists NL login code is: {code}",
    )


def _env() -> BotEnv:
    return BotEnv(
        signup_private_key="unused-in-these-tests",
        bot_api_shared_secret="test-shared-secret",
    )


def _server_with_secret(client: MockSignalClient) -> BotApiServer:
    return BotApiServer(_config(), client, _env())


class BotApiServerTests(unittest.IsolatedAsyncioTestCase):
    async def test_valid_request_relays_the_otp_message(self) -> None:
        client = MockSignalClient([])
        server = _server_with_secret(client)

        with TestClient(server._build_app()) as test_client:
            response = test_client.post(
                "/messages/otp",
                json={"aci": "11111111-1111-1111-1111-111111111111", "code": "123456"},
                headers={"Authorization": "Bearer test-shared-secret"},
            )
            self.assertEqual(response.status_code, 200)

        self.assertEqual(
            client.sent_contact_messages,
            [
                (
                    "11111111-1111-1111-1111-111111111111",
                    "Your Vegan Activists NL login code is: 123456",
                )
            ],
        )

    async def test_wrong_shared_secret_is_rejected(self) -> None:
        client = MockSignalClient([])
        server = _server_with_secret(client)

        with TestClient(server._build_app()) as test_client:
            response = test_client.post(
                "/messages/otp",
                json={"aci": "aci-1", "code": "123456"},
                headers={"Authorization": "Bearer wrong-secret"},
            )
            self.assertEqual(response.status_code, 401)

        self.assertEqual(client.sent_contact_messages, [])

    async def test_missing_fields_are_rejected(self) -> None:
        client = MockSignalClient([])
        server = _server_with_secret(client)

        with TestClient(server._build_app()) as test_client:
            response = test_client.post(
                "/messages/otp",
                json={"aci": "aci-1"},
                headers={"Authorization": "Bearer test-shared-secret"},
            )
            self.assertEqual(response.status_code, 400)

        self.assertEqual(client.sent_contact_messages, [])

    async def test_malformed_code_is_rejected(self) -> None:
        client = MockSignalClient([])
        server = _server_with_secret(client)

        with TestClient(server._build_app()) as test_client:
            for bad_code in ["1234", "1234567", "abcdef", "12345a"]:
                response = test_client.post(
                    "/messages/otp",
                    json={"aci": "aci-1", "code": bad_code},
                    headers={"Authorization": "Bearer test-shared-secret"},
                )
                self.assertEqual(response.status_code, 400, f"code={bad_code!r}")

        self.assertEqual(client.sent_contact_messages, [])


if __name__ == "__main__":
    unittest.main()
