"""
MRMUR Formatter — Fine-Tuning Training Script

Trains Llama 3.1 8B Instruct with LoRA on our voice dictation formatter dataset
using Tinker's supervised learning pipeline.

Usage:
  cd formatter-fine-tuning
  source .venv/bin/activate
  python train.py

What this does:
  1. Loads train.jsonl (~1.6K chat-format examples)
  2. Connects to Tinker API (cloud GPU, no local GPU needed)
  3. Trains LoRA adapter on Llama 3.1 8B Instruct
  4. Runs inline evaluation on val.jsonl every 10 steps (NLL) + every 25 steps (exact match)
  5. Saves checkpoints every epoch + final model
  6. Logs training metrics (loss, NLL, progress) to console + optionally WandB

Training math:
  - ~1.6K examples / 64 batch_size = ~25 steps per epoch
  - 4 epochs = ~100 total steps
  - Checkpoints saved every 25 steps (once per epoch) + final
  - NLL evaluation every 10 steps, custom eval every 25 steps
  - Total training time: ~10-30 minutes (depends on Tinker queue)

Go/No-Go gate (post-training):
  - Accuracy >= 95% on test set
  - Latency < 200ms p95
  - Zero regressions on edge cases
"""

import asyncio
import json
import os
import sys
from pathlib import Path

# ── Load .env before importing tinker ────────────────────────────────────
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

# Verify API key is set
if not os.environ.get("TINKER_API_KEY"):
    print("ERROR: TINKER_API_KEY not set.")
    print("  Either set it in .env or run: export TINKER_API_KEY='your-key'")
    sys.exit(1)

import tinker
from tinker import types as tinker_types

from tinker_cookbook import checkpoint_utils, renderers

from tinker_cookbook.hyperparam_utils import get_lr
from tinker_cookbook.supervised import train
from tinker_cookbook.supervised.data import (
    FromConversationFileBuilder,
    conversation_to_datum,
)
from tinker_cookbook.supervised.nll_evaluator import NLLEvaluator
from tinker_cookbook.supervised.types import ChatDatasetBuilderCommonConfig
from tinker_cookbook.tokenizer_utils import get_tokenizer


# ══════════════════════════════════════════════════════════════════════════
#  CONFIGURATION — Change these to experiment
# ══════════════════════════════════════════════════════════════════════════

MODEL_NAME = "meta-llama/Llama-3.1-8B-Instruct"

# LoRA rank: controls adapter capacity.
#   32 = cookbook default, good balance for most SFT tasks.
#   Sweep results show rank 32-64 works best for Llama-class models.
LORA_RANK = 32

# Learning rate: for continuation training from Iter2 Step 36 checkpoint.
#   Iter1 fresh start: 2.86e-4, Iter2 continuation: 1e-4 (1/3 of fresh).
#   Iter3: 5e-5 (half of Iter2) — dataset grows +27% (802→1022), conservative LR
#   prevents overwriting already-learned hinglish/email patterns.
LEARNING_RATE = 5e-5

# LR schedule: "linear" decays from max to 0. Prevents overfitting in later steps.
#   Other options: "cosine" (smoother decay), "constant" (no decay — risky for small data).
LR_SCHEDULE = "linear"

# Batch size: examples processed per step.
#   64 gives ~16 steps/epoch for 1022 examples (more granular than 128 which gives ~8).
#   Execution guide recommends 64 for datasets < 5K examples.
BATCH_SIZE = 64

# Epochs: full passes through the training data.
#   3 epochs with 1022 examples at batch 64 = ~48 total steps.
#   Same as Iter2 — dataset size is comparable (1022 vs 802).
NUM_EPOCHS = 3

# Max sequence length in tokens is derived from the regenerated dataset:
#   max_observed_length + 128 tokens of headroom, rounded up to the next 512 bucket.
MAX_LENGTH_MARGIN = 128
MAX_LENGTH_BUCKET = 512

# Train only on the assistant's output (not system prompt or user input).
#   LAST_ASSISTANT_MESSAGE: since each example has exactly one assistant turn,
#   this means loss is only computed on the formatted output.
#   System prompt + user message get 0 weight — model learns to FORMAT, not repeat.
TRAIN_ON_WHAT = renderers.TrainOnWhat.LAST_ASSISTANT_MESSAGE

# ── Continuation Checkpoint ──────────────────────────────────────────────
# Load Step 36 checkpoint from iteration 2 (full model weights, fresh optimizer).
# Must use state_path ("weights/000036"), NOT sampler_path ("sampler_weights/000036").
# Set to None for fresh training from base model.
LOAD_CHECKPOINT_PATH = "tinker://527ecf69-90d1-50bb-83db-9d3439255aab:train:0/weights/000036"

# ── Checkpointing ────────────────────────────────────────────────────────
# Save full checkpoint every N steps. ~16 steps/epoch → save every ~¾ epoch.
SAVE_EVERY = 12

# Rolling checkpoints (lightweight, for resume if training crashes).
# Saved every 10 steps, auto-deleted after 1 day.
ROLLING_SAVE_EVERY = 10
ROLLING_TTL_SECONDS = 86400  # 1 day

# ── Evaluation ───────────────────────────────────────────────────────────
# NLL evaluation every N steps (forward-only, but still non-trivial on long prompts).
EVAL_EVERY = 6



# ── Logging ──────────────────────────────────────────────────────────────
# WandB project name. Set to None to disable WandB (metrics still saved locally).
# If enabled and WANDB_API_KEY is in .env, see live curves at wandb.ai.
WANDB_PROJECT = None  # Set to "mrmur.ai" to enable WandB logging (needs WANDB_API_KEY in .env)

# ── Paths ────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
TRAIN_FILE = str(SCRIPT_DIR / "data" / "splits_v3" / "train.jsonl")
VAL_FILE = str(SCRIPT_DIR / "data" / "splits_v3" / "val.jsonl")
TEST_FILE = str(SCRIPT_DIR / "data" / "splits_v3" / "test.jsonl")
LOG_DIR = str(SCRIPT_DIR / "logs")
TRAIN_PRICE_PER_MTOKENS = 0.40
PREFILL_PRICE_PER_MTOKENS = 0.13


def count_jsonl(path: str) -> int:
    """Count non-empty JSONL rows."""
    with open(path) as f:
        return sum(1 for line in f if line.strip())


def percentile(sorted_values: list[int], frac: float) -> int:
    """Return an integer percentile from an already sorted list."""
    index = min(int(len(sorted_values) * frac), len(sorted_values) - 1)
    return sorted_values[index]


def compute_split_length_stats(
    split_paths: dict[str, str],
    renderer_name: str,
) -> dict[str, dict[str, int]]:
    """Measure supervised token lengths for each split."""
    tokenizer = get_tokenizer(MODEL_NAME)
    renderer = renderers.get_renderer(renderer_name, tokenizer)
    stats: dict[str, dict[str, int]] = {}

    for split_name, path in split_paths.items():
        lengths: list[int] = []
        with open(path) as f:
            for line in f:
                if not line.strip():
                    continue
                row = json.loads(line)
                messages = [
                    renderers.Message(role=message["role"], content=message["content"])
                    for message in row["messages"]
                ]
                model_input, _ = renderer.build_supervised_example(
                    messages,
                    train_on_what=TRAIN_ON_WHAT,
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

    return stats


def recommend_max_length(length_stats: dict[str, dict[str, int]]) -> int:
    """Pick the next 512-token bucket above max_observed + headroom."""
    max_observed = max(stats["max"] for stats in length_stats.values())
    required = max_observed + MAX_LENGTH_MARGIN
    return ((required + MAX_LENGTH_BUCKET - 1) // MAX_LENGTH_BUCKET) * MAX_LENGTH_BUCKET


def print_token_audit(
    length_stats: dict[str, dict[str, int]],
    max_length: int,
    total_steps: int,
) -> None:
    """Print token-length and rough cost estimates for the current splits."""
    print("\nToken audit:")
    for split_name in ["train", "val", "test"]:
        stats = length_stats[split_name]
        print(
            f"  {split_name}: min/p50/p95/max = "
            f"{stats['min']} / {stats['p50']} / {stats['p95']} / {stats['max']} "
            f"(rows={stats['count']})"
        )
    print(f"  Recommended MAX_LENGTH: {max_length}")

    train_tokens_per_epoch = length_stats["train"]["total"]
    total_train_tokens = train_tokens_per_epoch * NUM_EPOCHS
    nll_eval_runs = total_steps // EVAL_EVERY if total_steps > 0 else 0
    total_val_nll_tokens = length_stats["val"]["total"] * nll_eval_runs
    train_cost = total_train_tokens / 1_000_000 * TRAIN_PRICE_PER_MTOKENS
    nll_eval_cost = total_val_nll_tokens / 1_000_000 * PREFILL_PRICE_PER_MTOKENS
    print(
        "  Rough cost: "
        f"train=${train_cost:.2f}, "
        f"val_nll=${nll_eval_cost:.2f}"
    )





# ══════════════════════════════════════════════════════════════════════════
#  VAL NLL EVALUATOR BUILDER
#  Computes NLL on val set during training (cheap, runs every eval_every).
# ══════════════════════════════════════════════════════════════════════════

def build_val_nll_evaluator(val_file: str, max_length: int, renderer_name: str) -> NLLEvaluator:
    """Load val.jsonl and build an NLLEvaluator for it."""
    tokenizer = get_tokenizer(MODEL_NAME)
    renderer = renderers.get_renderer(renderer_name, tokenizer)

    val_data = []
    with open(val_file) as f:
        for line in f:
            row = json.loads(line)
            messages = [
                renderers.Message(role=m["role"], content=m["content"])
                for m in row["messages"]
            ]
            datum = conversation_to_datum(
                messages, renderer, max_length, TRAIN_ON_WHAT
            )
            val_data.append(datum)

    print(f"  Val NLL evaluator: {len(val_data)} examples loaded")
    return NLLEvaluator(val_data, name="val")


# ══════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════

def main():
    from datetime import datetime

    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    run_name = f"mrmur-formatter-training-iteration-3"
    log_path = f"{LOG_DIR}/{run_name}"
    log_path_obj = Path(log_path)

    # Verify files exist
    for label, fpath in [("Train", TRAIN_FILE), ("Val", VAL_FILE), ("Test", TEST_FILE)]:
        if not Path(fpath).exists():
            print(f"ERROR: {label} file not found: {fpath}")
            print("  Run: python prepare_training_data.py")
            sys.exit(1)

    if log_path_obj.exists():
        print(f"ERROR: Log path already exists: {log_path}")
        print("  Pick a new run name or remove the old log directory intentionally.")
        sys.exit(1)

    # Resolve renderer before length audit so train/eval use the same format.
    renderer_name = checkpoint_utils.resolve_renderer_name_from_checkpoint_or_default(
        model_name=MODEL_NAME,
        explicit_renderer_name=None,
        load_checkpoint_path=LOAD_CHECKPOINT_PATH,
        base_url=None,
    )

    train_examples = count_jsonl(TRAIN_FILE)
    steps_per_epoch = train_examples // BATCH_SIZE
    dropped_per_epoch = train_examples % BATCH_SIZE
    total_steps = steps_per_epoch * NUM_EPOCHS
    split_length_stats = compute_split_length_stats(
        {
            "train": TRAIN_FILE,
            "val": VAL_FILE,
            "test": TEST_FILE,
        },
        renderer_name=renderer_name,
    )
    max_length = recommend_max_length(split_length_stats)

    print("=" * 65)
    print("  MRMUR Formatter — Fine-Tuning")
    print("=" * 65)
    print(f"Using renderer: {renderer_name}")
    print(f"Training rows: {train_examples}")
    print(f"Steps: {steps_per_epoch}/epoch x {NUM_EPOCHS} epochs = {total_steps} steps")
    if dropped_per_epoch:
        print(f"Note: {dropped_per_epoch} rows are left out per epoch by the cookbook batcher.")
    if total_steps < 100:
        print("WARNING: Tinker recommends at least 100 training steps for best results.")
    print_token_audit(split_length_stats, max_length, total_steps)

    print("=" * 65)
    print(f"  Model:          {MODEL_NAME}")
    print(f"  LoRA rank:      {LORA_RANK}")
    print(f"  Learning rate:  {LEARNING_RATE:.6f} (hardcoded for continuation training)")
    print(f"  LR schedule:    {LR_SCHEDULE}")
    print(f"  Batch size:     {BATCH_SIZE}")
    print(f"  Epochs:         {NUM_EPOCHS}")
    print(f"  Max length:     {max_length} tokens")
    print(f"  Train on:       {TRAIN_ON_WHAT.value}")
    print(f"  Train file:     {TRAIN_FILE}")
    print(f"  Val file:       {VAL_FILE}")
    print(f"  Log path:       {log_path}")
    print(f"  WandB:          {WANDB_PROJECT or 'disabled'}")
    print(f"  Save every:     {SAVE_EVERY} steps (~1 epoch)")
    print(f"  NLL eval every: {EVAL_EVERY} steps")
    print("=" * 65)
    print()

    # Build dataset from train.jsonl
    common_config = ChatDatasetBuilderCommonConfig(
        model_name_for_tokenizer=MODEL_NAME,
        renderer_name=renderer_name,
        max_length=max_length,
        batch_size=BATCH_SIZE,
        train_on_what=TRAIN_ON_WHAT,
    )

    dataset_builder = FromConversationFileBuilder(
        common_config=common_config,
        file_path=TRAIN_FILE,
        test_size=0,        # no internal split — we have separate val/test files
        shuffle_seed=42,
    )

    # Build evaluators
    print("\nSetting up evaluators...")

    # 1. NLL evaluator on val set (runs every eval_every steps)
    val_nll_evaluator = build_val_nll_evaluator(VAL_FILE, max_length, renderer_name)



    # Build training config
    config = train.Config(
        log_path=log_path,
        model_name=MODEL_NAME,
        renderer_name=renderer_name,
        load_checkpoint_path=LOAD_CHECKPOINT_PATH,
        dataset_builder=dataset_builder,

        # Evaluators: NLL only (fast forward-pass)
        evaluator_builders=[lambda: val_nll_evaluator],

        # Hyperparameters
        learning_rate=LEARNING_RATE,
        lr_schedule=LR_SCHEDULE,
        num_epochs=NUM_EPOCHS,
        lora_rank=LORA_RANK,

        # Adam optimizer (cookbook defaults, empirically validated)
        adam_beta1=0.9,
        adam_beta2=0.95,
        adam_eps=1e-8,

        # Infrastructure
        base_url=None,

        # Checkpointing
        save_every=SAVE_EVERY,
        eval_every=EVAL_EVERY,
        rolling_save_every=ROLLING_SAVE_EVERY,
        rolling_ttl_seconds=ROLLING_TTL_SECONDS,
        ttl_seconds=2592000,  # Keep checkpoints for 30 days (1 month)

        # Logging
        wandb_project=WANDB_PROJECT,
        wandb_name=run_name,
    )

    # Start training
    print("\nStarting training...")
    print("(This may take 10-30 minutes depending on Tinker queue)\n")
    asyncio.run(train.main(config))

    print("\n" + "=" * 65)
    print("  Training complete!")
    print(f"  Checkpoints saved in: {log_path}")
    print("  Next step: python evaluate.py --checkpoint <path>")
    print("=" * 65)


if __name__ == "__main__":
    main()
