from __future__ import annotations

import unittest
from unittest.mock import patch

from bot.bot_env import BotEnv, MissingEnvironmentVariablesError

_ALL_VARS = {
    "VANL_SIGNUP_PRIVATE_KEY": "seed",
    "VANL_BOT_API_SHARED_SECRET": "secret",
}


class BotEnvTests(unittest.TestCase):
    def test_loads_all_variables_when_present(self) -> None:
        with patch.dict("os.environ", _ALL_VARS, clear=True):
            env = BotEnv.load()

        self.assertEqual(env.signup_private_key, "seed")
        self.assertEqual(env.bot_api_shared_secret, "secret")

    def test_lists_every_missing_variable_with_a_description(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(MissingEnvironmentVariablesError) as ctx:
                BotEnv.load()

        message = str(ctx.exception)
        self.assertIn("VANL_SIGNUP_PRIVATE_KEY", message)
        self.assertIn("VANL_BOT_API_SHARED_SECRET", message)

    def test_reports_only_the_variables_actually_missing(self) -> None:
        with patch.dict("os.environ", {"VANL_SIGNUP_PRIVATE_KEY": "seed"}, clear=True):
            with self.assertRaises(MissingEnvironmentVariablesError) as ctx:
                BotEnv.load()

        message = str(ctx.exception)
        self.assertNotIn("VANL_SIGNUP_PRIVATE_KEY", message)
        self.assertIn("VANL_BOT_API_SHARED_SECRET", message)


if __name__ == "__main__":
    unittest.main()
