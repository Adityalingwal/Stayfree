"""
Build formatter train/val/test splits from seeds_v4 files.

Split strategy (v4):
  train.jsonl  — all seeds_v4 bucket files (excluding evaluation.jsonl and
                 validation.jsonl), shuffled with SPLIT_SEED, messages format only.
                 Includes voice_commands (150 rows) this iteration.
  val.jsonl    — seeds_v4/validation.jsonl. Rows only have {bucket, input, output};
                 app_category is derived from bucket here (email→email, else→work)
                 before rendering messages.
  test.jsonl   — seeds_v4/evaluation.jsonl, messages format + metadata fields
                 (bucket, app_category). Matches updated evaluate.py schema.

v4 bucket sizes (training):
  asr_errors         267
  basic_formatting   302
  edge_cases         178
  email_context      322
  hinglish           687
  numbers_formatting 177
  self_correction    213
  voice_commands     150
  ───────────────────────
  TOTAL              2296

v4 evaluation set: 451 examples across 8 buckets (bucket field).
v4 validation set: 369 examples across 8 buckets (bucket field).

Changes vs v3:
  - SEED_DIR/SPLIT_DIR point to _v4
  - Val rows have no app_category field → derive from bucket
  - Test rows use 'bucket' instead of v3's 'source_bucket'
  - No 'dictionary' field anywhere (feature dropped)

Output: data/splits_v4/{train,val,test}.jsonl
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

from prompt_utils import SEED_REQUIRED_KEYS, build_messages


SCRIPT_DIR = Path(__file__).parent
SEED_DIR = SCRIPT_DIR / "data" / "seeds_v4"
SPLIT_DIR = SCRIPT_DIR / "data" / "splits_v4"

SPLIT_SEED = 42

# These two files live in seeds_v4 but are NOT training data
EXCLUDED_FROM_TRAIN = {"evaluation.jsonl", "validation.jsonl"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_jsonl(path: Path) -> list[dict[str, Any]]:
    """Supports both strict single-line JSONL and pretty-printed consecutive JSON objects."""
    text = path.read_text(encoding="utf-8")
    rows: list[dict[str, Any]] = []
    decoder = json.JSONDecoder()
    idx = 0
    length = len(text)
    while idx < length:
        while idx < length and text[idx].isspace():
            idx += 1
        if idx == length:
            break
        obj, parsed_len = decoder.raw_decode(text[idx:])
        rows.append(obj)
        idx += parsed_len
    return rows


def validate_seed_row(row: dict[str, Any], path: Path, line_no: int) -> None:
    missing = SEED_REQUIRED_KEYS - set(row)
    if missing:
        raise ValueError(f"{path}:{line_no} missing keys: {sorted(missing)}")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def derive_app_category_from_bucket(bucket: str) -> str:
    """
    Val rows only have {bucket, input, output} — derive app_category for routing.
    Email bucket → "email" (lowercase matches prompt_utils.get_system_prompt's .lower() check).
    All others → "work" (default; non-email rows go to GENERAL_PROMPT regardless of category).
    """
    return "email" if str(bucket).lower() == "email" else "work"


# ---------------------------------------------------------------------------
# Build train.jsonl
# ---------------------------------------------------------------------------

def build_train() -> list[dict[str, Any]]:
    """
    Load every *.jsonl in seeds_v4 except evaluation.jsonl and validation.jsonl.
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

    # Shuffle all training rows together — intermixes all buckets so every batch
    # sees a uniform mix (prevents bucket-sequential forgetting during training)
    random.Random(SPLIT_SEED).shuffle(seed_rows)

    # Serialize to messages-only format (Tinker train format)
    return [{"messages": build_messages(row)} for row in seed_rows]


# ---------------------------------------------------------------------------
# Build val.jsonl
# ---------------------------------------------------------------------------

def build_val() -> list[dict[str, Any]]:
    """
    Load seeds_v4/validation.jsonl, derive app_category from bucket, shuffle,
    convert to messages format.

    Val rows come in as {bucket, input, output} (no app_category). We inject
    app_category based on bucket so build_messages() can route to the right prompt.
    """
    fpath = SEED_DIR / "validation.jsonl"
    if not fpath.exists():
        raise FileNotFoundError(f"validation.jsonl not found at {fpath}")

    rows = load_jsonl(fpath)
    prepared: list[dict[str, Any]] = []
    for line_no, row in enumerate(rows, 1):
        if "bucket" not in row or "input" not in row or "output" not in row:
            raise ValueError(
                f"{fpath}:{line_no} missing required val keys (bucket, input, output). "
                f"Got: {sorted(row.keys())}"
            )
        if "app_category" not in row:
            row = dict(row)  # don't mutate loaded data
            row["app_category"] = derive_app_category_from_bucket(row["bucket"])
        prepared.append(row)

    # Shuffle val rows too — per-batch NLL isn't computed per-bucket so order
    # doesn't matter for metrics, but keeps ordering deterministic across runs
    random.Random(SPLIT_SEED).shuffle(prepared)

    print(f"  val  ← validation.jsonl: {len(prepared)} examples")
    return [{"messages": build_messages(row)} for row in prepared]


# ---------------------------------------------------------------------------
# Build test.jsonl
# ---------------------------------------------------------------------------

def build_test() -> list[dict[str, Any]]:
    """
    Load seeds_v4/evaluation.jsonl, shuffle, serialize to messages format +
    metadata (bucket, app_category) for per-bucket accuracy reporting.

    v4 uses 'bucket' (v3 used 'source_bucket' — evaluate.py updated to match).
    """
    fpath = SEED_DIR / "evaluation.jsonl"
    if not fpath.exists():
        raise FileNotFoundError(f"evaluation.jsonl not found at {fpath}")

    raw_rows = load_jsonl(fpath)
    serialized: list[dict[str, Any]] = []

    for line_no, row in enumerate(raw_rows, 1):
        validate_seed_row(row, fpath, line_no)
        if "bucket" not in row:
            raise ValueError(
                f"{fpath}:{line_no} missing 'bucket' field. "
                "Every evaluation row must have a bucket label."
            )

        serialized.append({
            "messages": build_messages(row),
            "bucket": row["bucket"],
            "app_category": row["app_category"],
        })

    random.Random(SPLIT_SEED).shuffle(serialized)

    print(f"  test ← evaluation.jsonl: {len(raw_rows)} examples")
    return serialized


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print(f"Building splits_v4 in {SPLIT_DIR} …\n")

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
    print(f"Done!  train={len(train_rows)}  val={len(val_rows)}  test={len(test_rows)}  total={total}")


if __name__ == "__main__":
    main()
