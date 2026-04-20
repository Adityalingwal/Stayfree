"""Prompt rendering helpers for formatter fine-tuning data."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).parent
SYSTEM_PROMPT_PATH = SCRIPT_DIR / "system_prompt_v3.txt"
SYSTEM_PROMPT_TEMPLATE = SYSTEM_PROMPT_PATH.read_text()
PLACEHOLDER_TOKENS = (
    "{dictionary_entries}",
    "{app_category}",
)
SEED_REQUIRED_KEYS = {"input", "output", "app_category", "dictionary"}


def render_dictionary_entries(dictionary: Mapping[str, str] | None) -> str:
    """Render dictionary entries into the system prompt template."""
    if not dictionary:
        return "- None"

    return "\n".join(
        f'- "{term}" -> "{replacement}"'
        for term, replacement in sorted(dictionary.items())
    )


def render_system_prompt(row: Mapping[str, Any]) -> str:
    """Fill the formatter system prompt template for one training/eval example."""
    system_prompt = SYSTEM_PROMPT_TEMPLATE
    system_prompt = system_prompt.replace(
        "{dictionary_entries}",
        render_dictionary_entries(row.get("dictionary")),
    )
    system_prompt = system_prompt.replace("{app_category}", str(row["app_category"]))
    return system_prompt


def build_messages(row: Mapping[str, Any]) -> list[dict[str, str]]:
    """Build the final train/eval messages for one seed example."""
    return [
        {"role": "system", "content": render_system_prompt(row)},
        {"role": "user", "content": str(row["input"])},
        {"role": "assistant", "content": str(row["output"])},
    ]
