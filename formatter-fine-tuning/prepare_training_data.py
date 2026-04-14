"""
Build formatter train/val/test splits from seeds_v2 files.

Split strategy (v2):
  train.jsonl  — all seeds_v2 bucket files (excluding evaluation.jsonl and
                 validation.jsonl), shuffled with SPLIT_SEED, messages format only.
  val.jsonl    — seeds_v2/validation.jsonl, messages format only.
  test.jsonl   — seeds_v2/evaluation.jsonl, messages format + metadata fields
                 (bucket_override → source_bucket, style, app_name, app_category,
                 dictionary).  Matches the format evaluate.py expects.

Output: data/splits_v2/{train,val,test}.jsonl
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

from prompt_utils import SEED_REQUIRED_KEYS, build_messages


SCRIPT_DIR = Path(__file__).parent
SEED_DIR = SCRIPT_DIR / "data" / "seeds_v2"
SPLIT_DIR = SCRIPT_DIR / "data" / "splits_v2"

SPLIT_SEED = 42

# These two files live in seeds_v2 but are NOT training data
EXCLUDED_FROM_TRAIN = {"evaluation.jsonl", "validation.jsonl"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            rows.append(row)
    return rows


def validate_seed_row(row: dict[str, Any], path: Path, line_no: int) -> None:
    missing = SEED_REQUIRED_KEYS - set(row)
    if missing:
        raise ValueError(f"{path}:{line_no} missing keys: {sorted(missing)}")
    if not isinstance(row["dictionary"], dict):
        raise ValueError(f"{path}:{line_no} 'dictionary' must be a JSON object")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------------------
# Build train.jsonl
# ---------------------------------------------------------------------------

def build_train() -> list[dict[str, Any]]:
    """
    Load every *.jsonl in seeds_v2 except evaluation.jsonl and validation.jsonl.
    Validate, shuffle with SPLIT_SEED, convert to messages format.
    """
    seed_rows: list[dict[str, Any]] = []

    bucket_files = sorted(
        p for p in SEED_DIR.glob("*.jsonl")
        if p.name not in EXCLUDED_FROM_TRAIN
    )

    if not bucket_files:
        raise FileNotFoundError(f"No training bucket files found in {SEED_DIR}")

    for fpath in bucket_files:
        rows = load_jsonl(fpath)
        for line_no, row in enumerate(rows, 1):
            validate_seed_row(row, fpath, line_no)
        seed_rows.extend(rows)
        print(f"  train ← {fpath.name}: {len(rows)} examples")

    # Shuffle all training rows together
    random.Random(SPLIT_SEED).shuffle(seed_rows)

    # Serialize to messages-only format
    return [{"messages": build_messages(row)} for row in seed_rows]


# ---------------------------------------------------------------------------
# Build val.jsonl
# ---------------------------------------------------------------------------

def build_val() -> list[dict[str, Any]]:
    """
    Load seeds_v2/validation.jsonl, convert to messages format.
    """
    fpath = SEED_DIR / "validation.jsonl"
    if not fpath.exists():
        raise FileNotFoundError(f"validation.jsonl not found at {fpath}")

    rows = load_jsonl(fpath)
    for line_no, row in enumerate(rows, 1):
        validate_seed_row(row, fpath, line_no)

    print(f"  val  ← validation.jsonl: {len(rows)} examples")

    return [{"messages": build_messages(row)} for row in rows]


# ---------------------------------------------------------------------------
# Build test.jsonl
# ---------------------------------------------------------------------------

def build_test() -> list[dict[str, Any]]:
    """
    Load seeds_v2/evaluation.jsonl.
    Each row has a 'bucket_override' field — rename it to 'source_bucket' for
    evaluate.py compatibility.
    Serialize to messages format + metadata fields.
    """
    fpath = SEED_DIR / "evaluation.jsonl"
    if not fpath.exists():
        raise FileNotFoundError(f"evaluation.jsonl not found at {fpath}")

    raw_rows = load_jsonl(fpath)
    serialized: list[dict[str, Any]] = []

    for line_no, row in enumerate(raw_rows, 1):
        validate_seed_row(row, fpath, line_no)

        # bucket_override → source_bucket
        source_bucket = row.get("bucket_override") or row.get("source_bucket")
        if not source_bucket:
            raise ValueError(
                f"{fpath}:{line_no} missing both 'bucket_override' and 'source_bucket'"
            )

        serialized.append({
            "messages": build_messages(row),
            "source_bucket": source_bucket,
            "style": row["style"],
            "app_name": row["app_name"],
            "app_category": row["app_category"],
            "dictionary": row["dictionary"],
        })

    print(f"  test ← evaluation.jsonl: {len(raw_rows)} examples")
    return serialized


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("Building splits_v2 …\n")

    print("train.jsonl")
    train_rows = build_train()
    write_jsonl(SPLIT_DIR / "train.jsonl", train_rows)
    print(f"  → {len(train_rows)} examples written\n")

    print("val.jsonl")
    val_rows = build_val()
    write_jsonl(SPLIT_DIR / "val.jsonl", val_rows)
    print(f"  → {len(val_rows)} examples written\n")

    print("test.jsonl")
    test_rows = build_test()
    write_jsonl(SPLIT_DIR / "test.jsonl", test_rows)
    print(f"  → {len(test_rows)} examples written\n")

    total = len(train_rows) + len(val_rows) + len(test_rows)
    print(f"✅ Done!  train={len(train_rows)}  val={len(val_rows)}  test={len(test_rows)}  total={total}")


if __name__ == "__main__":
    main()
