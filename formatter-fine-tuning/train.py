"""
StayFree Formatter — Fine-Tuning Training Script

Trains Llama 3.1 8B Instruct with LoRA on our voice dictation formatter dataset
using Tinker's supervised learning pipeline.

Usage:
  cd formatter-fine-tuning
  source .venv/bin/activate
  python train.py

What this does:
  1. Loads train.jsonl (1,655 chat-format examples)
  2. Connects to Tinker API (cloud GPU, no local GPU needed)
  3. Trains LoRA adapter on Llama 3.1 8B Instruct
  4. Runs inline evaluation on val.jsonl every 5 steps (NLL + exact match)
  5. Saves checkpoints every epoch + final model
  6. Logs training metrics (loss, NLL, progress) to console + optionally WandB

Training math:
  - 1,655 examples / 64 batch_size = ~25 steps per epoch
  - 3 epochs = ~75 total steps
  - Checkpoints saved every 25 steps (once per epoch) + final
  - NLL evaluation every 5 steps, custom eval every 25 steps
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

from tinker_cookbook import checkpoint_utils, renderers, model_info
from tinker_cookbook.eval.evaluators import SamplingClientEvaluator
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

# Learning rate: calculated via Tinker's calibrated formula for Llama.
#   Formula: LR = 5e-5 * 10 * (2000 / hidden_size) ^ 0.781
#   For Llama 3.1 8B: hidden_size=4096 → LR ≈ 2.86e-4
#   This is ~3x higher than the naive default (1e-4) — empirically optimal.
LEARNING_RATE = get_lr(MODEL_NAME, is_lora=True)

# LR schedule: "linear" decays from max to 0. Prevents overfitting in later steps.
#   Other options: "cosine" (smoother decay), "constant" (no decay — risky for small data).
LR_SCHEDULE = "linear"

# Batch size: examples processed per step.
#   64 gives ~25 steps/epoch (more granular updates than 128 which gives ~13).
#   Execution guide recommends 64 for datasets < 5K examples.
BATCH_SIZE = 64

# Epochs: full passes through the training data.
#   3 epochs = model sees every example 3 times.
#   Small datasets (<5K) typically need 3-5 epochs.
NUM_EPOCHS = 3

# Max sequence length in tokens.
#   Our system prompt is ~9K tokens, user+assistant ~300 tokens = ~9.3K total.
#   10240 gives safe headroom for the longest examples.
MAX_LENGTH = 10240

# Train only on the assistant's output (not system prompt or user input).
#   LAST_ASSISTANT_MESSAGE: since each example has exactly one assistant turn,
#   this means loss is only computed on the formatted output.
#   System prompt + user message get 0 weight — model learns to FORMAT, not repeat.
TRAIN_ON_WHAT = renderers.TrainOnWhat.LAST_ASSISTANT_MESSAGE

# ── Checkpointing ────────────────────────────────────────────────────────
# Save full checkpoint every N steps. ~25 steps/epoch → save every epoch.
SAVE_EVERY = 25

# Rolling checkpoints (lightweight, for resume if training crashes).
# Saved every 10 steps, auto-deleted after 2 hours.
ROLLING_SAVE_EVERY = 10
ROLLING_TTL_SECONDS = 7200  # 2 hours

# ── Evaluation ───────────────────────────────────────────────────────────
# NLL evaluation every N steps (cheap: just forward pass on val data).
EVAL_EVERY = 5

# Custom exact-match evaluation every N steps (expensive: runs generation).
# Set to ~once per epoch.
INFREQUENT_EVAL_EVERY = 25

# ── Logging ──────────────────────────────────────────────────────────────
# WandB project name. Set to None to disable WandB (metrics still saved locally).
# If enabled and WANDB_API_KEY is in .env, see live curves at wandb.ai.
WANDB_PROJECT = "mrmur.ai"

# ── Paths ────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
TRAIN_FILE = str(SCRIPT_DIR / "data" / "splits" / "train.jsonl")
VAL_FILE = str(SCRIPT_DIR / "data" / "splits" / "val.jsonl")
LOG_DIR = str(SCRIPT_DIR / "logs")


# ══════════════════════════════════════════════════════════════════════════
#  CUSTOM FORMATTER EVALUATOR
#  Runs during training to measure exact-match accuracy on val set.
# ══════════════════════════════════════════════════════════════════════════

class FormatterEvaluator(SamplingClientEvaluator):
    """
    Evaluates the formatter model by generating outputs for val examples
    and comparing against expected outputs (exact match + fuzzy match).

    This runs as an "infrequent evaluator" during training (~once per epoch).
    """

    def __init__(
        self,
        val_file: str,
        model_name: str,
        max_eval_examples: int = 50,  # Limit to keep eval fast
    ):
        self.model_name = model_name
        self.max_eval_examples = max_eval_examples

        # Load val examples
        self.val_examples = []
        with open(val_file) as f:
            for line in f:
                self.val_examples.append(json.loads(line))

        # Subsample if too many (keep eval fast during training)
        if len(self.val_examples) > max_eval_examples:
            import random
            rng = random.Random(42)
            self.val_examples = rng.sample(self.val_examples, max_eval_examples)

        # Setup tokenizer + renderer
        self.tokenizer = get_tokenizer(model_name)
        renderer_name = model_info.get_recommended_renderer_name(model_name)
        self.renderer = renderers.get_renderer(renderer_name, self.tokenizer)

    async def __call__(self, sampling_client: tinker.SamplingClient) -> dict[str, float]:
        exact_match = 0
        fuzzy_match = 0
        total = len(self.val_examples)

        sampling_params = tinker_types.SamplingParams(
            max_tokens=512,
            temperature=0.0,  # Deterministic — we want consistent output
            stop=self.renderer.get_stop_sequences(),
        )

        for ex in self.val_examples:
            # Build prompt from system + user (exclude assistant)
            prompt_messages = [
                renderers.Message(role=m["role"], content=m["content"])
                for m in ex["messages"][:2]  # system + user only
            ]
            model_input = self.renderer.build_generation_prompt(prompt_messages)

            # Generate
            result = await sampling_client.sample_async(
                prompt=model_input,
                num_samples=1,
                sampling_params=sampling_params,
            )
            response_msg = self.renderer.parse_response(result.sequences[0].tokens)[0]
            generated = renderers.get_text_content(response_msg).strip()
            expected = ex["messages"][2]["content"].strip()

            # Exact match
            if generated == expected:
                exact_match += 1
                fuzzy_match += 1
            # Fuzzy match: normalize whitespace + case-insensitive
            elif " ".join(generated.split()).lower() == " ".join(expected.split()).lower():
                fuzzy_match += 1

        return {
            "val/exact_match": exact_match / total if total > 0 else 0.0,
            "val/fuzzy_match": fuzzy_match / total if total > 0 else 0.0,
            "val/total_examples": float(total),
        }


# ══════════════════════════════════════════════════════════════════════════
#  VAL NLL EVALUATOR BUILDER
#  Computes NLL on val set during training (cheap, runs every eval_every).
# ══════════════════════════════════════════════════════════════════════════

def build_val_nll_evaluator() -> NLLEvaluator:
    """Load val.jsonl and build an NLLEvaluator for it."""
    tokenizer = get_tokenizer(MODEL_NAME)
    renderer_name = model_info.get_recommended_renderer_name(MODEL_NAME)
    renderer = renderers.get_renderer(renderer_name, tokenizer)

    val_data = []
    with open(VAL_FILE) as f:
        for line in f:
            row = json.loads(line)
            messages = [
                renderers.Message(role=m["role"], content=m["content"])
                for m in row["messages"]
            ]
            datum = conversation_to_datum(
                messages, renderer, MAX_LENGTH, TRAIN_ON_WHAT
            )
            val_data.append(datum)

    print(f"  Val NLL evaluator: {len(val_data)} examples loaded")
    return NLLEvaluator(val_data, name="val")


# ══════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════

def main():
    from datetime import datetime

    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M")
    run_name = f"stayfree-formatter-r{LORA_RANK}-lr{LEARNING_RATE:.2e}-b{BATCH_SIZE}-{timestamp}"
    log_path = f"{LOG_DIR}/{run_name}"

    print("=" * 65)
    print("  StayFree Formatter — Fine-Tuning")
    print("=" * 65)
    print(f"  Model:          {MODEL_NAME}")
    print(f"  LoRA rank:      {LORA_RANK}")
    print(f"  Learning rate:  {LEARNING_RATE:.6f} (from get_lr formula)")
    print(f"  LR schedule:    {LR_SCHEDULE}")
    print(f"  Batch size:     {BATCH_SIZE}")
    print(f"  Epochs:         {NUM_EPOCHS}")
    print(f"  Max length:     {MAX_LENGTH} tokens")
    print(f"  Train on:       {TRAIN_ON_WHAT.value}")
    print(f"  Train file:     {TRAIN_FILE}")
    print(f"  Val file:       {VAL_FILE}")
    print(f"  Log path:       {log_path}")
    print(f"  WandB:          {WANDB_PROJECT or 'disabled'}")
    print(f"  Save every:     {SAVE_EVERY} steps (~1 epoch)")
    print(f"  NLL eval every: {EVAL_EVERY} steps")
    print(f"  Gen eval every: {INFREQUENT_EVAL_EVERY} steps (~1 epoch)")
    print("=" * 65)
    print()

    # Verify files exist
    for label, fpath in [("Train", TRAIN_FILE), ("Val", VAL_FILE)]:
        if not Path(fpath).exists():
            print(f"ERROR: {label} file not found: {fpath}")
            print("  Run: python prepare_training_data.py")
            sys.exit(1)

    # Resolve renderer
    renderer_name = checkpoint_utils.resolve_renderer_name_from_checkpoint_or_default(
        model_name=MODEL_NAME,
        explicit_renderer_name=None,
        load_checkpoint_path=None,
        base_url=None,
    )
    print(f"Using renderer: {renderer_name}")

    # Build dataset from train.jsonl
    common_config = ChatDatasetBuilderCommonConfig(
        model_name_for_tokenizer=MODEL_NAME,
        renderer_name=renderer_name,
        max_length=MAX_LENGTH,
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

    # 1. NLL evaluator on val set (runs every eval_every steps, cheap)
    val_nll_evaluator = build_val_nll_evaluator()

    # 2. Custom formatter evaluator on val set (runs every infrequent_eval_every, expensive)
    formatter_evaluator = FormatterEvaluator(
        val_file=VAL_FILE,
        model_name=MODEL_NAME,
        max_eval_examples=50,  # Subsample for speed
    )

    # Build training config
    config = train.Config(
        log_path=log_path,
        model_name=MODEL_NAME,
        renderer_name=renderer_name,
        load_checkpoint_path=None,
        dataset_builder=dataset_builder,

        # Evaluators: NLL (frequent) + exact match (infrequent)
        evaluator_builders=[lambda: val_nll_evaluator],
        infrequent_evaluator_builders=[lambda: formatter_evaluator],

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
        infrequent_eval_every=INFREQUENT_EVAL_EVERY,
        rolling_save_every=ROLLING_SAVE_EVERY,
        rolling_ttl_seconds=ROLLING_TTL_SECONDS,
        ttl_seconds=604800,  # Keep checkpoints for 7 days

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
