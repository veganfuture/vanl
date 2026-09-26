from __future__ import annotations

from pathlib import Path

import toml
from pydantic import BaseModel, Field, ValidationError


class WelcomeFeatureConfig(BaseModel):
    enable: bool = True
    welcome_state_path: Path = Path("run/group_state.json")
    group_name: str
    message: str
    message_min_interval_seconds: int = Field(default=90, gt=0)
    welcome_state_max_age_seconds: int = Field(default=15 * 60, gt=0)
    periodic_membership_reconcile_interval_seconds: float = Field(default=30.0, ge=0)


class SignupFeatureConfig(BaseModel):
    website_signup_base_url: str
    signup_message_template: str


class BotApiConfig(BaseModel):
    host: str
    """
    Only ever bind to loopback — the website calls this over localhost, it must
    never be reachable from the internet.
    """
    port: int = Field(gt=0, lt=65536)
    otp_message_template: str


class ArchiveDbConfig(BaseModel):
    """
    Connection details for the bot's own Postgres tables (bot_archived_*,
    bot_event_notifications - migrations/0012_bot_archive.sql in web/),
    reached via the narrowly-scoped vanl_bot role. Same Postgres instance the
    website uses - host/port/database are shared, only the role differs
    (see docs on the website side for why: one backup covers everything).
    Password comes from VANL_BOT_DATABASE_PASSWORD (bot_env.py), not TOML -
    same split as the website's own database.user (TOML) / VANL_DATABASE_PASSWORD
    (env) config.
    """

    host: str = "127.0.0.1"
    port: int = Field(default=5432, gt=0, lt=65536)
    database: str
    user: str = "vanl_bot"


class MessageArchiveFeatureConfig(BaseModel):
    """
    Generic Signal-group message archive - not event-specific. Watches every
    group in archived_groups and logs every message to Postgres; what any
    particular feature (event review, a future newsletter digest) does with
    that archive is a separate concern from capturing it.
    """

    enable: bool = True
    archived_groups: list[str]


class EventReviewFeatureConfig(BaseModel):
    """
    Periodic Signal-events-group review: an LLM tool-use pass over newly
    archived messages, drafting/updating events on the website and notifying
    admins. See docs on the Signal ingestion plan for the full design.
    """

    events_group_name: str
    admin_group_name: str
    review_interval_seconds: float = Field(default=15 * 60, gt=0)
    message_action_delay_seconds: int = Field(default=10 * 60, gt=0)
    """
    A message only becomes eligible to act on once it's been sitting for
    this long - gives a poster's self-corrections (a follow-up message
    fixing a typo'd date, an extra flyer photo) time to land before the bot
    drafts/notifies from what might still be incomplete. Reading for context
    (list_group_messages) is never clipped by this, only acting is.
    """
    website_base_url: str
    """Base URL the bot calls the public events API on, and builds edit-page links from (e.g. https://veganactivists.nl)."""
    anthropic_model: str
    max_agent_turns: int = Field(default=30, gt=0)
    """Hard cap on the tool-use loop's back-and-forth per review run, so a confused model can't loop forever."""


class BotConfig(BaseModel):
    verbose: bool = False
    sync_on_startup: bool = True
    signal_cli_timeout_seconds: float = Field(default=30.0, gt=0)

    signal_receive_timeout_seconds: int = Field(default=5, gt=0)
    """
    Determines how long the bot waits for signal messages/events to appear.
    If no signal payload is received within this time the bot spents a cycle,
    which is also an event to all the features.
    """

    signal_rate_limit_max_messages: int = Field(default=20, gt=0)
    """
    Max messages the bot will send to the same contact or group within
    signal_rate_limit_window_seconds. Tracked in memory per recipient
    (SignalRpcClient); a send past the cap raises RateLimitExceededError
    instead of calling signal-cli. Protects against a bug or abuse loop
    hammering one recipient, not a distributed/persistent rate limit.
    """

    signal_rate_limit_window_seconds: float = Field(default=60.0, gt=0)
    """Trailing window, in seconds, signal_rate_limit_max_messages is measured over."""

    signal_daemon_socket_path: Path
    """
    Must match wherever signal-daemon.service's --signal-daemon-dir actually put the socket
    (see flake.nix's nixosModules.default) - no default here since a silently-wrong guess means
    the bot can never connect, rather than failing loudly at startup.
    """

    signal_cli_attachments_dir: Path | None = None
    """
    Directory signal-cli writes received attachment bytes to (see
    SignalClient.read_attachment_bytes) - same "no silently-wrong guess"
    reasoning as signal_daemon_socket_path, but optional since only
    message_archive_feature needs it. Typically
    {--signal-daemon-dir}/attachments - verify against the actual installed
    signal-cli version before relying on it in production.
    """

    welcome_feature: WelcomeFeatureConfig | None = None
    signup_feature: SignupFeatureConfig | None = None
    bot_api: BotApiConfig | None = None
    archive_db: ArchiveDbConfig | None = None
    message_archive_feature: MessageArchiveFeatureConfig | None = None
    event_review_feature: EventReviewFeatureConfig | None = None


def load_config(config_path: Path) -> BotConfig:
    """
    Load bot configuration from TOML.

    Args:
    - config_path - path to the TOML config file

    Returns: validated bot config
    """
    try:
        with config_path.open(encoding="utf-8") as file:
            raw_config = toml.load(file)
            return BotConfig.model_validate(raw_config)
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"Config file not found: {config_path}") from exc
    except ValidationError as exc:
        raise ValueError(f"Invalid config file {config_path}: {exc}") from exc
