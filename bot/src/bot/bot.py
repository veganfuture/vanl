from __future__ import annotations

import asyncio
import json
import time

from loguru import logger

from bot.api_server import BotApiServer
from bot.bot_env import BotEnv
from bot.bot_feature import BotFeature
from bot.config import BotConfig
from bot.signal_cli import SignalClient, create_signal_client
from bot.signup_feature import SignupFeature
from bot.welcome_feature import WelcomeFeature


SHUTDOWN_MSG = """
-----------------
Shutting Down Bot
-----------------
"""

STARTUP_MSG = """
---------------
Starting Up Bot
---------------
"""


def run_bot(config: BotConfig, env: BotEnv) -> None:
    try:
        asyncio.run(_run_bot_async(config, env))
    except KeyboardInterrupt:
        pass
    except Exception:
        logger.exception("Signal bot crashed")
        raise


async def _run_bot_async(config: BotConfig, env: BotEnv) -> None:
    client = create_signal_client(
        command_timeout_seconds=config.signal_cli_timeout_seconds,
        receive_timeout_seconds=config.signal_receive_timeout_seconds,
        daemon_socket_path=config.signal_daemon_socket_path,
    )
    features = _build_features(config, client, env)
    api_server = BotApiServer(config.bot_api, client, env) if config.bot_api else None
    runtime = SignalBotRunner(config, client, features, api_server)
    await runtime.run()


class SignalBotRunner:
    def __init__(
        self,
        config: BotConfig,
        client: SignalClient,
        features: list[BotFeature],
        api_server: BotApiServer | None = None,
    ) -> None:
        self.config = config
        self.client = client
        self.features = features
        self.api_server = api_server

    async def run(self) -> None:
        """
        Run the bot event loop until shutdown or failure.

        Returns: None
        """
        logger.info(STARTUP_MSG)
        logger.info(
            "Bot config: {}",
            json.dumps(self.config.model_dump(mode="json"), indent=2),
        )

        try:
            if self.config.sync_on_startup:
                logger.info("Requesting Signal sync on startup")
                await self.client.send_sync_request()

            for feature in self.features:
                logger.info("Setting up feature {}", feature.name)
                await feature.setup()

            if self.api_server is not None:
                await self.api_server.start()

            i = 0
            while True:
                try:
                    payloads = await self.client.receive_events()
                except Exception:
                    logger.exception("Failed while receiving Signal events")
                    raise

                cycle_finished_at = time.monotonic()
                for feature in self.features:
                    try:
                        await feature.handle_payloads(payloads, cycle_finished_at)
                    except Exception:
                        logger.exception(
                            "Feature {} failed while handling Signal payloads",
                            feature.name,
                        )
                for feature in self.features:
                    try:
                        await feature.on_cycle(cycle_finished_at)
                    except Exception:
                        logger.exception(
                            "Feature {} failed during cycle work",
                            feature.name,
                        )
                if i % 10 == 0:
                    logger.debug("Bot idling")
                i += 1
        finally:
            if self.api_server is not None:
                await self.api_server.close()
            await self.client.close()
            logger.info(SHUTDOWN_MSG)


def _build_features(
    config: BotConfig, client: SignalClient, env: BotEnv
) -> list[BotFeature]:
    features: list[BotFeature] = []
    if config.welcome_feature is not None:
        features.append(WelcomeFeature(config.welcome_feature, client))
    if config.signup_feature is not None:
        features.append(SignupFeature(config.signup_feature, client, env))
    return features
