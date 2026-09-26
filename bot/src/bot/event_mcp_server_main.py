from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from bot.archive_db import ArchiveDb
from bot.bot_env import BotEnv
from bot.config import load_config
from bot.event_mcp_server import EventMcpServer
from bot.event_web_client import EventWebClient
from bot.signal_cli import create_signal_client

"""
Standalone entrypoint for the same MCP server event_review_feature.py drives
in-process during a periodic run - `python -m bot.event_mcp_server_main
--config configs/prod.toml` (or the `event-mcp-server` console script) lets
Claude Desktop/Code (or any other MCP client) attach to the identical tool
surface directly over stdio, for ad hoc queries over the archive (e.g.
"summarize last week's events chat") - the reuse goal behind building this
as a real MCP server rather than plain Python functions.

Needs the same signal-cli daemon, Postgres, and website API access as the
bot itself (it resolves the admin group by name and can post to it, reads/
writes the archive, and calls the website as the signal-bot account) - not
a lighter-weight tool, just one more way to reach the same one.
"""


async def _main() -> None:
    parser = argparse.ArgumentParser(description="Standalone Signal archive MCP server")
    parser.add_argument(
        "--config", type=Path, required=True, help="Path to the bot config TOML file"
    )
    args = parser.parse_args()

    config = load_config(args.config)
    env = BotEnv.load()

    if config.archive_db is None or config.event_review_feature is None:
        raise SystemExit(
            "archive_db and event_review_feature must both be configured to run this server"
        )

    db = await ArchiveDb.connect(
        host=config.archive_db.host,
        port=config.archive_db.port,
        database=config.archive_db.database,
        user=config.archive_db.user,
        password=env.bot_database_password,
    )
    web = EventWebClient(
        base_url=config.event_review_feature.website_base_url,
        api_token=env.bot_website_api_token,
    )
    client = create_signal_client(
        command_timeout_seconds=config.signal_cli_timeout_seconds,
        receive_timeout_seconds=config.signal_receive_timeout_seconds,
        daemon_socket_path=config.signal_daemon_socket_path,
        rate_limit_max_messages=config.signal_rate_limit_max_messages,
        rate_limit_window_seconds=config.signal_rate_limit_window_seconds,
        attachments_dir=config.signal_cli_attachments_dir,
    )

    admin_group = await client.get_group_by_name(
        config.event_review_feature.admin_group_name
    )
    if admin_group is None or admin_group.resolved_id is None:
        raise SystemExit(
            f"could not resolve admin group {config.event_review_feature.admin_group_name!r}"
        )

    server = EventMcpServer(
        db=db,
        web=web,
        signal_client=client,
        admin_group_id=admin_group.resolved_id,
        website_base_url=config.event_review_feature.website_base_url,
        watched_groups=(
            config.message_archive_feature.archived_groups
            if config.message_archive_feature is not None
            else []
        ),
    )
    try:
        await server.run_stdio()
    finally:
        await client.close()
        await db.close()


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
