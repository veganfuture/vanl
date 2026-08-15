from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class _EnvVarSpec:
    name: str
    description: str


_ENV_VAR_SPECS: list[_EnvVarSpec] = [
    _EnvVarSpec(
        name="VANL_SIGNUP_PRIVATE_KEY",
        description=(
            "Base64url-encoded Ed25519 private key seed used to sign the "
            "signup links the bot sends over Signal. See README.md, section "
            '"Environment variables" for how to generate one.'
        ),
    ),
    _EnvVarSpec(
        name="VANL_BOT_API_SHARED_SECRET",
        description=(
            "Shared secret the website must present as a Bearer token when "
            "calling the bot's local HTTP API. See README.md, section "
            '"Environment variables" for how to generate one.'
        ),
    ),
]


class MissingEnvironmentVariablesError(RuntimeError):
    def __init__(self, missing: list[_EnvVarSpec]) -> None:
        lines = [
            "Missing required environment variable(s):",
            *(f"  - {spec.name}: {spec.description}" for spec in missing),
        ]
        super().__init__("\n".join(lines))


@dataclass(frozen=True)
class BotEnv:
    """
    Every environment variable the bot needs, loaded and validated up front
    (see load()) so a missing one is reported clearly - with what it's for
    and where to get it - instead of surfacing later as an opaque crash deep
    into startup. Constructed once in __main__.py and passed by dependency
    injection to whichever classes need a piece of it (SignupFeature,
    BotApiServer), rather than having each of them read os.environ itself.
    """

    signup_private_key: str
    bot_api_shared_secret: str

    @staticmethod
    def load() -> BotEnv:
        """
        Read and validate all required environment variables.

        Returns: the loaded BotEnv

        Raises: MissingEnvironmentVariablesError listing every missing
        variable (not just the first one found) along with a description of
        what each is for.
        """
        values: dict[str, str] = {}
        missing: list[_EnvVarSpec] = []
        for spec in _ENV_VAR_SPECS:
            value = os.environ.get(spec.name)
            if value:
                values[spec.name] = value
            else:
                missing.append(spec)

        if missing:
            raise MissingEnvironmentVariablesError(missing)

        return BotEnv(
            signup_private_key=values["VANL_SIGNUP_PRIVATE_KEY"],
            bot_api_shared_secret=values["VANL_BOT_API_SHARED_SECRET"],
        )
