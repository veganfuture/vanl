from __future__ import annotations

import unittest

from bot.__test__.mock_signal_client import MockSignalClient
from bot.bot_env import BotEnv
from bot.config import SignupFeatureConfig
from bot.signal_cli import (
    DataMessage,
    Envelope,
    GroupInfo,
    SignalPayload,
    SyncMessage,
    SyncSentMessage,
)
from bot.signup_feature import SignupFeature
from bot.signup_token import generate_keypair


def _config() -> SignupFeatureConfig:
    return SignupFeatureConfig(
        website_signup_base_url="https://veganactivists.nl/signup",
        signup_message_template="Welcome! Click this link to set up your Vegan "
        "Activists NL account (valid for 15 minutes): {url}",
    )


async def _feature_with_secrets(client: MockSignalClient) -> SignupFeature:
    seed_b64, _public_b64 = generate_keypair()
    env = BotEnv(
        signup_private_key=seed_b64,
        bot_api_shared_secret="unused-in-these-tests",
    )
    feature = SignupFeature(_config(), client, env)
    await feature.setup()
    return feature


class SignupFeatureMessageTests(unittest.IsolatedAsyncioTestCase):
    async def test_direct_message_gets_a_signup_link(self) -> None:
        client = MockSignalClient([])
        feature = await _feature_with_secrets(client)

        await feature.handle_payloads(
            [
                SignalPayload(
                    envelope=Envelope(
                        sourceUuid="11111111-1111-1111-1111-111111111111",
                        dataMessage=DataMessage(message="hi, how do I join?"),
                    )
                )
            ],
            cycle_finished_at=0.0,
        )

        self.assertEqual(len(client.sent_contact_messages), 1)
        recipient, message = client.sent_contact_messages[0]
        self.assertEqual(recipient, "11111111-1111-1111-1111-111111111111")
        self.assertIn("https://veganactivists.nl/signup?token=", message)

    async def test_group_message_is_ignored(self) -> None:
        client = MockSignalClient([])
        feature = await _feature_with_secrets(client)

        await feature.handle_payloads(
            [
                SignalPayload(
                    envelope=Envelope(
                        sourceUuid="11111111-1111-1111-1111-111111111111",
                        dataMessage=DataMessage(
                            message="hi",
                            groupInfo=GroupInfo(groupId="some-group"),
                        ),
                    )
                )
            ],
            cycle_finished_at=0.0,
        )

        self.assertEqual(client.sent_contact_messages, [])

    async def test_bots_own_synced_message_is_ignored(self) -> None:
        client = MockSignalClient([])
        feature = await _feature_with_secrets(client)

        await feature.handle_payloads(
            [
                SignalPayload(
                    envelope=Envelope(
                        sourceUuid="bot-aci",
                        syncMessage=SyncMessage(
                            sentMessage=SyncSentMessage(
                                message="Welcome! Click this link..."
                            )
                        ),
                    )
                )
            ],
            cycle_finished_at=0.0,
        )

        self.assertEqual(client.sent_contact_messages, [])

    async def test_message_without_resolvable_aci_is_ignored(self) -> None:
        client = MockSignalClient([])
        feature = await _feature_with_secrets(client)

        await feature.handle_payloads(
            [SignalPayload(envelope=Envelope(dataMessage=DataMessage(message="hi")))],
            cycle_finished_at=0.0,
        )

        self.assertEqual(client.sent_contact_messages, [])


if __name__ == "__main__":
    unittest.main()
