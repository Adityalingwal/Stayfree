"""
MRMUR Formatter Fine-Tuning - Setup Verification

Usage:
  source .venv/bin/activate
  python verify_setup.py
"""

from __future__ import annotations

import json
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from prepare_training_data import build_split_artifacts, load_seed_rows
from prompt_utils import PLACEHOLDER_TOKENS


SCRIPT_DIR = Path(__file__).parent
SPLITS_DIR = SCRIPT_DIR / "data" / "splits"
TRAIN_VAL_KEYS = {"messages"}
TEST_KEYS = {"source_bucket", "style", "app_name", "app_category", "dictionary", "messages"}
TRAIN_PRICE_PER_MTOKENS = 0.40
PREFILL_PRICE_PER_MTOKENS = 0.13
NUM_EPOCHS = 4
EVAL_EVERY = 10
BATCH_SIZE = 64


def load_dotenv() -> None:
    env_path = SCRIPT_DIR / ".env"
    if not env_path.exists():
        return

    with env_path.open() as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())


def percentile(sorted_values: list[int], frac: float) -> int:
    index = min(int(len(sorted_values) * frac), len(sorted_values) - 1)
    return sorted_values[index]


def validate_messages(messages: Any, split: str, line_no: int) -> list[str]:
    errors: list[str] = []

    if not isinstance(messages, list):
        return [f"{split}: line {line_no}: messages must be a list"]

    roles = [message.get("role") for message in messages if isinstance(message, dict)]
    if roles != ["system", "user", "assistant"]:
        errors.append(f"{split}: line {line_no}: wrong roles {roles}")
        return errors

    for idx, message in enumerate(messages):
        if not isinstance(message, dict):
            errors.append(f"{split}: line {line_no}: message {idx} must be an object")
            continue
        if not isinstance(message.get("content"), str):
            errors.append(f"{split}: line {line_no}: message {idx} content must be a string")

    if not errors:
        leaked = [token for token in PLACEHOLDER_TOKENS if token in messages[0]["content"]]
        if leaked:
            errors.append(f"{split}: line {line_no}: unrendered prompt placeholders {leaked}")

    return errors


def validate_split_row(split: str, row: dict[str, Any], line_no: int) -> list[str]:
    errors: list[str] = []

    if split in {"train", "val"}:
        if set(row) != TRAIN_VAL_KEYS:
            errors.append(
                f"{split}: line {line_no}: expected keys {sorted(TRAIN_VAL_KEYS)}, got {sorted(row)}"
            )
    elif split == "test":
        if set(row) != TEST_KEYS:
            errors.append(
                f"{split}: line {line_no}: expected keys {sorted(TEST_KEYS)}, got {sorted(row)}"
            )
        elif not isinstance(row.get("dictionary"), dict):
            errors.append(f"{split}: line {line_no}: dictionary must be an object")
    else:
        errors.append(f"{split}: line {line_no}: unknown split")

    errors.extend(validate_messages(row.get("messages"), split, line_no))
    return errors


def load_jsonl_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open() as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def compare_actual_vs_expected(
    split_name: str,
    actual_rows: list[dict[str, Any]],
    expected_rows: list[dict[str, Any]],
) -> str | None:
    if len(actual_rows) != len(expected_rows):
        return f"{split_name}: expected {len(expected_rows)} rows, found {len(actual_rows)} rows"

    for line_no, (actual, expected) in enumerate(zip(actual_rows, expected_rows, strict=True), 1):
        if actual != expected:
            actual_keys = sorted(actual)
            expected_keys = sorted(expected)
            return (
                f"{split_name}: line {line_no} does not match regenerated split "
                f"(actual keys={actual_keys}, expected keys={expected_keys})"
            )
    return None


def build_io_keys(rows: list[dict[str, Any]]) -> set[tuple[str, str]]:
    keys = set()
    for row in rows:
        messages = row["messages"]
        keys.add((messages[1]["content"], messages[2]["content"]))
    return keys


def print_distribution_summary(seed_splits: dict[str, list[dict[str, Any]]]) -> None:
    print("  Distribution summary:")
    for split_name in ["train", "val", "test"]:
        rows = seed_splits[split_name]
        style_counts = Counter(row["style"] for row in rows)
        category_counts = Counter(row["app_category"] for row in rows)
        print(
            f"    {split_name}: styles={dict(style_counts)} "
            f"categories={dict(category_counts)}"
        )


def audit_distribution(
    seed_rows: list[dict[str, Any]],
    seed_splits: dict[str, list[dict[str, Any]]],
) -> list[str]:
    warnings: list[str] = []
    total_rows = len(seed_rows)
    corpus_style = Counter(row["style"] for row in seed_rows)
    corpus_category = Counter(row["app_category"] for row in seed_rows)
    corpus_bucket = Counter(row["source_bucket"] for row in seed_rows)

    for split_name, rows in seed_splits.items():
        split_total = len(rows)
        split_style = Counter(row["style"] for row in rows)
        split_category = Counter(row["app_category"] for row in rows)

        for style, corpus_count in corpus_style.items():
            corpus_share = corpus_count / total_rows
            split_share = split_style[style] / split_total if split_total else 0.0
            if abs(split_share - corpus_share) > 0.10:
                warnings.append(
                    f"{split_name}: style {style!r} share differs from corpus by "
                    f"{abs(split_share - corpus_share) * 100:.1f} percentage points"
                )

        for category, corpus_count in corpus_category.items():
            corpus_share = corpus_count / total_rows
            split_share = split_category[category] / split_total if split_total else 0.0
            if abs(split_share - corpus_share) > 0.10:
                warnings.append(
                    f"{split_name}: category {category!r} share differs from corpus by "
                    f"{abs(split_share - corpus_share) * 100:.1f} percentage points"
                )

    val_buckets = {row["source_bucket"] for row in seed_splits["val"]}
    test_buckets = {row["source_bucket"] for row in seed_splits["test"]}
    for bucket, count in corpus_bucket.items():
        if count >= 20 and bucket not in val_buckets and bucket not in test_buckets:
            warnings.append(
                f"bucket {bucket!r} has {count} seed rows but is absent from both val and test"
            )

    return warnings


def compute_token_stats() -> tuple[dict[str, dict[str, int]], int]:
    from tinker_cookbook import model_info, renderers
    from tinker_cookbook.tokenizer_utils import get_tokenizer

    model_name = "meta-llama/Llama-3.1-8B-Instruct"
    tokenizer = get_tokenizer(model_name)
    renderer_name = model_info.get_recommended_renderer_name(model_name)
    renderer = renderers.get_renderer(renderer_name, tokenizer)

    stats: dict[str, dict[str, int]] = {}
    for split_name in ["train", "val", "test"]:
        path = SPLITS_DIR / f"{split_name}.jsonl"
        lengths: list[int] = []
        for row in load_jsonl_rows(path):
            messages = [
                renderers.Message(role=message["role"], content=message["content"])
                for message in row["messages"]
            ]
            model_input, _ = renderer.build_supervised_example(
                messages,
                train_on_what=renderers.TrainOnWhat.LAST_ASSISTANT_MESSAGE,
            )
            lengths.append(len(model_input.to_ints()))

        lengths.sort()
        stats[split_name] = {
            "count": len(lengths),
            "min": lengths[0],
            "p50": percentile(lengths, 0.50),
            "p95": percentile(lengths, 0.95),
            "max": lengths[-1],
            "total": sum(lengths),
        }

    max_observed = max(split_stats["max"] for split_stats in stats.values())
    recommended_max_length = ((max_observed + 128 + 511) // 512) * 512
    return stats, recommended_max_length


def print_token_stats(token_stats: dict[str, dict[str, int]], recommended_max_length: int) -> None:
    print("  Token audit:")
    for split_name in ["train", "val", "test"]:
        stats = token_stats[split_name]
        print(
            f"    {split_name}: min/p50/p95/max = "
            f"{stats['min']} / {stats['p50']} / {stats['p95']} / {stats['max']} "
            f"(rows={stats['count']})"
        )

    steps_per_epoch = token_stats["train"]["count"] // BATCH_SIZE
    total_steps = steps_per_epoch * NUM_EPOCHS
    train_cost = token_stats["train"]["total"] * NUM_EPOCHS / 1_000_000 * TRAIN_PRICE_PER_MTOKENS
    val_nll_cost = (
        token_stats["val"]["total"] * (total_steps // EVAL_EVERY) / 1_000_000 * PREFILL_PRICE_PER_MTOKENS
    )
    print(f"  Recommended MAX_LENGTH: {recommended_max_length}")
    print(
        f"  Rough cost estimate: train=${train_cost:.2f}, "
        f"val_nll=${val_nll_cost:.2f}, custom generation eval not included"
    )


load_dotenv()

print("=" * 55)
print("MRMUR Formatter Fine-Tuning - Setup Verification")
print("=" * 55)
print()

errors: list[str] = []
warnings: list[str] = []

# 1. Python version
print(f"[1/7] Python version: {sys.version.split()[0]}")
if sys.version_info < (3, 11):
    errors.append("Python 3.11+ required")
    print("  FAIL")
else:
    print("  OK")

# 2. Tinker SDK
print("\n[2/7] Tinker SDK...")
try:
    import tinker

    ver = getattr(tinker, "__version__", "installed")
    print(f"  OK - tinker {ver}")
except ImportError as exc:
    errors.append(f"tinker not installed: {exc}")
    print(f"  FAIL: {exc}")

# 3. Tinker Cookbook
print("\n[3/7] Tinker Cookbook...")
cookbook_ready = False
try:
    from tinker_cookbook import model_info, renderers
    from tinker_cookbook.supervised.data import FromConversationFileBuilder, conversation_to_datum
    from tinker_cookbook.tokenizer_utils import get_tokenizer

    cookbook_ready = True
    _ = model_info, renderers, FromConversationFileBuilder, conversation_to_datum, get_tokenizer
    print("  OK - renderers, model_info, FromConversationFileBuilder available")
except ImportError as exc:
    errors.append(f"tinker_cookbook not installed: {exc}")
    print(f"  FAIL: {exc}")

# 4. PyTorch
print("\n[4/7] PyTorch...")
try:
    import torch

    print(f"  OK - torch {torch.__version__}")
except ImportError as exc:
    errors.append(f"torch not installed: {exc}")
    print(f"  FAIL: {exc}")

# 5. Transformers
print("\n[5/7] Transformers...")
try:
    import transformers

    print(f"  OK - transformers {transformers.__version__}")
except ImportError as exc:
    errors.append(f"transformers not installed: {exc}")
    print(f"  FAIL: {exc}")

# 6. TINKER_API_KEY
print("\n[6/7] TINKER_API_KEY...")
api_key = os.environ.get("TINKER_API_KEY")
if api_key and api_key != "your-key-here":
    print("  OK - key set")
else:
    warnings.append("TINKER_API_KEY not set or still placeholder")
    print("  WARNING: set your API key in .env")

# 7. Data files
print("\n[7/7] Training data...")
seed_rows = load_seed_rows()
seed_splits, expected_splits = build_split_artifacts(seed_rows)
actual_splits: dict[str, list[dict[str, Any]]] = {}

print_distribution_summary(seed_splits)

for split_name in ["train", "val", "test"]:
    path = SPLITS_DIR / f"{split_name}.jsonl"
    if not path.exists():
        errors.append(f"{split_name}: split file not found")
        print(f"  {split_name}: NOT FOUND")
        continue

    actual_rows = load_jsonl_rows(path)
    actual_splits[split_name] = actual_rows
    split_errors: list[str] = []
    for line_no, row in enumerate(actual_rows, 1):
        split_errors.extend(validate_split_row(split_name, row, line_no))

    mismatch = compare_actual_vs_expected(split_name, actual_rows, expected_splits[split_name])
    if mismatch:
        split_errors.append(mismatch)

    status = "OK" if not split_errors else "BAD FORMAT"
    print(f"  {split_name}: {len(actual_rows)} examples - {status}")
    for err in split_errors[:5]:
        print(f"    ERROR: {err}")
    if len(split_errors) > 5:
        print(f"    ... {len(split_errors) - 5} more errors")
    errors.extend(split_errors)

for left, right in [("train", "val"), ("train", "test"), ("val", "test")]:
    if left not in actual_splits or right not in actual_splits:
        continue
    overlap = build_io_keys(actual_splits[left]) & build_io_keys(actual_splits[right])
    if overlap:
        errors.append(f"{left}/{right} share {len(overlap)} duplicate input+output pairs")

warnings.extend(audit_distribution(seed_rows, seed_splits))

if cookbook_ready and not errors:
    try:
        token_stats, recommended_max_length = compute_token_stats()
        print_token_stats(token_stats, recommended_max_length)
    except Exception as exc:  # pragma: no cover - network/cache dependent
        warnings.append(f"token audit skipped: {exc}")
        print(f"  WARNING: token audit skipped: {exc}")

# Summary
print("\n" + "=" * 55)
if errors:
    print(f"FAIL - {len(errors)} error(s):")
    for err in errors:
        print(f"  - {err}")
elif warnings:
    print(f"OK with {len(warnings)} warning(s):")
    for warning in warnings:
        print(f"  - {warning}")
    print("\nFix warnings, then you're ready for training!")
else:
    print("ALL CHECKS PASSED - Ready for fine-tuning!")
print("=" * 55)

sys.exit(1 if errors else 0)
