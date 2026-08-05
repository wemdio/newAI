from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from bot.config import load_config
from bot.keyboards import main_menu_keyboard


class PromoConfigTests(unittest.TestCase):
    @patch.dict(
        os.environ,
        {
            "BOT_TOKEN": "test-token",
            "PROMO_CODE": " LEADSCAN30 ",
            "PROMO_DURATION_DAYS": "30",
        },
        clear=True,
    )
    def test_promo_settings_are_loaded_from_environment(self) -> None:
        config = load_config()

        self.assertEqual(config.promo_code, "LEADSCAN30")
        self.assertEqual(config.promo_duration_days, 30)


class PromoMenuTests(unittest.TestCase):
    def test_main_menu_contains_promo_activation_button(self) -> None:
        keyboard = main_menu_keyboard()
        labels = [button.text for row in keyboard.keyboard for button in row]

        self.assertIn("Активировать промокод", labels)


if __name__ == "__main__":
    unittest.main()
