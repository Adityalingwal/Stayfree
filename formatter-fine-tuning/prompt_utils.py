"""Prompt rendering helpers for formatter fine-tuning data."""

from __future__ import annotations

from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).parent

# Two fully static prompts — no dynamic placeholders in either.
# Routing is done by the caller based on app_category field in seed data.
GENERAL_PROMPT = (SCRIPT_DIR / "general_prompt.txt").read_text()
EMAIL_PROMPT = (SCRIPT_DIR / "email_prompt.txt").read_text()

# Required fields in every seed JSONL row
SEED_REQUIRED_KEYS = {"input", "output", "app_category"}

# Sanity check — neither prompt should have unrendered placeholders
_FORBIDDEN_PLACEHOLDERS = ("{app_category}", "{style_preset}", "{app_name}", "{dictionary_entries}")
for _prompt_name, _prompt_text in [("general_prompt.txt", GENERAL_PROMPT), ("email_prompt.txt", EMAIL_PROMPT)]:
    for _ph in _FORBIDDEN_PLACEHOLDERS:
        if _ph in _prompt_text:
            raise ValueError(f"{_prompt_name} still contains unrendered placeholder: {_ph}")


def get_system_prompt(app_category: str) -> str:
    """Return the correct static system prompt based on app category.

    email_context rows use the EMAIL_PROMPT.
    All other categories (personal, work, other) use the GENERAL_PROMPT.
    """
    if app_category.lower() == "email":
        return EMAIL_PROMPT
    return GENERAL_PROMPT


def build_messages(row: dict[str, Any]) -> list[dict[str, str]]:
    """Build the final train/eval messages for one seed example."""
    return [
        {"role": "system", "content": get_system_prompt(row["app_category"])},
        {"role": "user", "content": str(row["input"])},
        {"role": "assistant", "content": str(row["output"])},
    ]
