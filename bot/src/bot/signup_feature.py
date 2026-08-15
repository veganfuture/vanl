from __future__ import annotations

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from loguru import logger

from bot import signup_token
from bot.bot_env import BotEnv
from bot.config import SignupFeatureConfig
from bot.signal_cli import SignalClient, SignalPayload


class SignupFeature:
    """
    Replies to a direct message with a signed, single-use link the website
    uses to create an account for that Signal ACI.
    """

    name = "signup"

    def __init__(
        self, config: SignupFeatureConfig, client: SignalClient, env: BotEnv
    ) -> None:
        self.config = config
        self.client = client
        self.env = env
        self._private_key: Ed25519PrivateKey | None = None

    async def setup(self) -> None:
        """
        Load the signing key from the injected environment.

        Returns: None
        """
        self._private_key = signup_token.load_private_key(self.env.signup_private_key)

    async def handle_payloads(
        self,
        payloads: list[SignalPayload],
        cycle_finished_at: float,
    ) -> None:
        """
        Reply with a signup link to anyone who direct-messages the bot.

        Returns: None
        """
        del cycle_finished_at
        for payload in payloads:
            await self._maybe_send_signup_link(payload)

    async def on_cycle(self, cycle_finished_at: float) -> None:
        del cycle_finished_at

    async def _maybe_send_signup_link(self, payload: SignalPayload) -> None:
        envelope = payload.envelope
        if envelope is None or envelope.data_message is None:
            # Only react to messages sent directly TO the bot. In particular this
            # must not match envelope.sync_message (the bot's own sent messages,
            # mirrored back via multi-device sync) or it would reply to itself.
            return
        if payload.extract_group_id() is not None:
            return
        text = payload.extract_message_text()
        if text is None:
            return

        aci = envelope.source_uuid
        if aci is None:
            logger.warning(
                "Signup DM received without a resolvable Signal ACI; ignoring"
            )
            return

        # Every DM gets a fresh link, regardless of how many times someone has
        # already asked — simple and safe for now; revisit if this needs
        # rate-limiting once real usage shows it matters.
        url = signup_token.build_signup_url(
            self.config.website_signup_base_url,
            self._require_private_key(),
            aci,
        )
        message = self.config.signup_message_template.format(url=url)
        await self.client.send_contact_message(aci, message)
        logger.info("Sent signup link to {}", aci)

    def _require_private_key(self) -> Ed25519PrivateKey:
        if self._private_key is None:
            raise RuntimeError(
                "SignupFeature.setup() must run before handling payloads"
            )
        return self._private_key
