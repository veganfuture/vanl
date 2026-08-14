from __future__ import annotations

import asyncio
import hmac
import os

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from loguru import logger

from bot.config import BotApiConfig
from bot.signal_cli import SignalCliError, SignalClient


class BotApiServer:
    """
    Small localhost-only HTTP API the website calls into (currently just to
    relay one-time login codes back to a user over Signal). This is an
    inbound HTTP server driven by the website, not a Signal-message-driven
    feature, so it's kept separate from the BotFeature list (see
    bot_feature.py) rather than mixed into one of them.
    """

    def __init__(self, config: BotApiConfig, client: SignalClient) -> None:
        self.config = config
        self.client = client
        self._shared_secret: str | None = None
        self._server: uvicorn.Server | None = None
        self._serve_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        """
        Load secrets from the environment and start listening.

        Returns: None
        """
        self._load_secret()

        app = self._build_app()
        uvicorn_config = uvicorn.Config(
            app,
            host=self.config.host,
            port=self.config.port,
            log_level="warning",
        )
        self._server = uvicorn.Server(uvicorn_config)
        self._serve_task = asyncio.create_task(self._server.serve())
        while not self._server.started:
            await asyncio.sleep(0.01)
        logger.info("Bot API listening on {}:{}", self.config.host, self.config.port)

    async def close(self) -> None:
        if self._server is not None:
            self._server.should_exit = True
        if self._serve_task is not None:
            await self._serve_task

    def _load_secret(self) -> None:
        """
        Load the shared secret from the environment (split out from start()
        so tests can populate it without binding a real TCP listener).

        Returns: None
        """
        self._shared_secret = _require_env("VANL_BOT_API_SHARED_SECRET")

    def _build_app(self) -> FastAPI:
        """
        Build the FastAPI application (split out from start() for
        testability with FastAPI's TestClient, which doesn't need a real TCP
        listener).

        Returns: the configured FastAPI application
        """
        app = FastAPI()
        app.post("/messages/otp")(self._handle_send_otp)
        return app

    async def _handle_send_otp(self, request: Request) -> Response:
        expected_secret = self._require_shared_secret()
        auth_header = request.headers.get("Authorization", "")
        if not hmac.compare_digest(auth_header, f"Bearer {expected_secret}"):
            logger.warning("Rejected /messages/otp request with a bad or missing shared secret")
            return JSONResponse({"error": "unauthorized"}, status_code=401)

        try:
            body = await request.json()
        except Exception as exc:
            logger.warning("Rejected /messages/otp request with an unparseable JSON body: {}", exc)
            return JSONResponse({"error": "invalid JSON body"}, status_code=400)

        aci = body.get("aci") if isinstance(body, dict) else None
        code = body.get("code") if isinstance(body, dict) else None
        if not isinstance(aci, str) or not aci or not isinstance(code, str) or not code:
            return JSONResponse({"error": "aci and code are required"}, status_code=400)

        message = self.config.otp_message_template.format(code=code)
        try:
            await self.client.send_contact_message(aci, message)
        except SignalCliError as exc:
            logger.error("Failed to send OTP message to {}: {}", aci, exc)
            return JSONResponse({"error": "failed to send message"}, status_code=502)

        return JSONResponse({"ok": True})

    def _require_shared_secret(self) -> str:
        if self._shared_secret is None:
            raise RuntimeError("BotApiServer.start() must run before handling requests")
        return self._shared_secret


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value
