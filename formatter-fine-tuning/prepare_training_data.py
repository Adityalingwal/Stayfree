"""
Build formatter train/val/test splits from seed JSONL files.

The split keeps duplicate input+output pairs in the same split so validation and
test accuracy are not inflated by seeing the same transformation during training
under a different app/style context.
"""

from __future__ import annotations

import json
import random
from collections import defaultdict
from pathlib import Path
from typing import Any

from prompt_utils import SEED_REQUIRED_KEYS, build_messages


SCRIPT_DIR = Path(__file__).parent
# Iteration 2: read from seeds_v2 (new targeted examples).
# Original seeds are preserved in data/seeds/ for reference.
SEED_DIR = SCRIPT_DIR / "data" / "seeds_v2"
SPLIT_DIR = SCRIPT_DIR / "data" / "splits_v2"

SPLIT_SEED = 42
TRAIN_RATIO = 0.80
VAL_RATIO = 0.10


def load_seed_rows() -> list[dict[str, Any]]:
    rows = []
    for path in sorted(SEED_DIR.glob("*.jsonl")):
        source_bucket = path.stem
        with path.open() as f:
            for line_no, line in enumerate(f, 1):
                if not line.strip():
                    continue
                row = json.loads(line)
                missing = SEED_REQUIRED_KEYS - set(row)
                if missing:
                    raise ValueError(f"{path}:{line_no} missing keys: {sorted(missing)}")
                if not isinstance(row["dictionary"], dict):
                    raise ValueError(f"{path}:{line_no} dictionary must be an object")
                row["source_bucket"] = source_bucket
                rows.append(row)
    return rows


def grouped_split(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    groups_by_io = defaultdict(list)
    for row in rows:
        groups_by_io[(row["input"], row["output"])].append(row)

    groups = list(groups_by_io.values())
    random.Random(SPLIT_SEED).shuffle(groups)

    total_rows = len(rows)
    targets = {
        "train": round(total_rows * TRAIN_RATIO),
        "val": round(total_rows * VAL_RATIO),
    }
    targets["test"] = total_rows - targets["train"] - targets["val"]

    splits: dict[str, list[dict[str, Any]]] = {"train": [], "val": [], "test": []}
    current_split = "train"

    for group in groups:
        if (
            current_split == "train"
            and len(splits["train"]) + len(group) > targets["train"]
            and len(splits["train"]) >= targets["train"] * 0.98
        ):
            current_split = "val"

        if (
            current_split == "val"
            and len(splits["val"]) + len(group) > targets["val"]
            and len(splits["val"]) >= targets["val"] * 0.98
        ):
            current_split = "test"

        splits[current_split].extend(group)

    return splits


def build_split_row(split_name: str, seed_row: dict[str, Any]) -> dict[str, Any]:
    row: dict[str, Any] = {"messages": build_messages(seed_row)}
    if split_name == "test":
        row.update(
            {
                "source_bucket": seed_row["source_bucket"],
                "style": seed_row["style"],
                "app_name": seed_row["app_name"],
                "app_category": seed_row["app_category"],
                "dictionary": seed_row["dictionary"],
            }
        )
    return row


def build_split_artifacts(
    seed_rows: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]]]:
    """Return split seed rows plus serialized rows written to disk."""
    rows = load_seed_rows() if seed_rows is None else seed_rows
    seed_splits = grouped_split(rows)
    serialized_splits = {
        split_name: [build_split_row(split_name, row) for row in split_rows]
        for split_name, split_rows in seed_splits.items()
    }
    return seed_splits, serialized_splits


def write_split(name: str, rows: list[dict[str, Any]]) -> None:
    SPLIT_DIR.mkdir(parents=True, exist_ok=True)
    path = SPLIT_DIR / f"{name}.jsonl"
    with path.open("w") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> None:
    seed_splits, serialized_splits = build_split_artifacts()

    for split_name in ["train", "val", "test"]:
        write_split(split_name, serialized_splits[split_name])
        print(f"{split_name}: {len(serialized_splits[split_name])} examples")

    print(f"total: {sum(len(rows) for rows in seed_splits.values())} examples")
    print(f"seed: {SPLIT_SEED}")


if __name__ == "__main__":
    main()
