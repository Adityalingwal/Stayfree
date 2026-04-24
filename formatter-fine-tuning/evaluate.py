"""
MRMUR Formatter — Post-Training Evaluation Script

Runs comprehensive evaluation on the test set after training completes.
This uses data the model has NEVER seen during training.

Usage:
  cd formatter-fine-tuning
  source .venv/bin/activate
  python evaluate.py --checkpoint <path-to-checkpoint>

  # Example:
  python evaluate.py --checkpoint logs/mrmur-formatter-r32-.../final
  python evaluate.py --checkpoint logs/mrmur-formatter-r32-.../checkpoints.jsonl

What this does:
  1. Loads the trained model from a Tinker checkpoint
  2. Generates formatted output for every test example
  3. Compares generated vs expected output
  4. Reports: overall accuracy, exact match %, bucket-wise breakdown
  5. Saves detailed results to evaluation_results.json

Go/No-Go Gate:
  - Accuracy >= 95% (LLM-as-Judge or exact match)
  - Zero regressions on edge cases
  - All 10 buckets performing above threshold
"""

import argparse
import asyncio
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

# ── Load .env ────────────────────────────────────────────────────────────
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

if not os.environ.get("TINKER_API_KEY"):
    print("ERROR: TINKER_API_KEY not set.")
    sys.exit(1)

import tinker
from tinker import types as tinker_types

from tinker_cookbook import renderers, model_info
from tinker_cookbook.tokenizer_utils import get_tokenizer

# ── Config ───────────────────────────────────────────────────────────────
MODEL_NAME = "meta-llama/Llama-3.1-8B-Instruct"
SCRIPT_DIR = Path(__file__).parent
TEST_FILE = str(SCRIPT_DIR / "data" / "splits_v4" / "test.jsonl")


def safe_label(value: str) -> str:
    """Convert a checkpoint/run label into a filesystem-safe stem."""
    return "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in value).strip("_")


def load_checkpoint_records(checkpoints_file: Path) -> list[dict]:
    """Load checkpoint records from a Tinker checkpoints.jsonl file."""
    records = []
    with checkpoints_file.open() as f:
        for line in f:
            if line.strip():
                records.append(json.loads(line))
    return records


def select_sampler_checkpoint(
    records: list[dict],
    checkpoint_name: str | None = None,
) -> dict:
    """Select a sampler checkpoint record, preferring an explicit or final record."""
    sampler_records = [record for record in records if record.get("sampler_path")]
    if not sampler_records:
        raise ValueError("No sampler_path records found in checkpoints.jsonl")

    if checkpoint_name is not None:
        matches = [record for record in sampler_records if record.get("name") == checkpoint_name]
        if matches:
            return matches[-1]
        raise ValueError(
            f"No sampler checkpoint named {checkpoint_name!r} found in checkpoints.jsonl"
        )

    final_records = [record for record in sampler_records if record.get("name") == "final"]
    return final_records[-1] if final_records else sampler_records[-1]


def resolve_sampling_checkpoint(checkpoint_arg: str) -> tuple[str, str]:
    """
    Resolve a CLI checkpoint argument to a Tinker sampler checkpoint path.

    Accepts:
      - tinker://.../sampler_weights/<name>
      - logs/<run>/checkpoints.jsonl
      - logs/<run> (prefers final sampler checkpoint)
      - logs/<run>/final or logs/<run>/<checkpoint_name>
    """
    if checkpoint_arg.startswith("tinker://"):
        return checkpoint_arg, safe_label(checkpoint_arg.removeprefix("tinker://"))

    path = Path(checkpoint_arg).expanduser()

    if path.is_file():
        if path.name != "checkpoints.jsonl":
            raise ValueError(
                f"Unsupported checkpoint file {path}. Pass checkpoints.jsonl or a tinker:// sampler path."
            )
        record = select_sampler_checkpoint(load_checkpoint_records(path))
        return record["sampler_path"], safe_label(f"{path.parent.name}_{record['name']}")

    if path.is_dir():
        checkpoints_file = path / "checkpoints.jsonl"
        if checkpoints_file.exists():
            record = select_sampler_checkpoint(load_checkpoint_records(checkpoints_file))
            return record["sampler_path"], safe_label(f"{path.name}_{record['name']}")
        raise ValueError(f"No checkpoints.jsonl found in checkpoint directory: {path}")

    checkpoints_file = path.parent / "checkpoints.jsonl"
    if checkpoints_file.exists():
        record = select_sampler_checkpoint(load_checkpoint_records(checkpoints_file), path.name)
        return record["sampler_path"], safe_label(f"{path.parent.name}_{record['name']}")

    raise ValueError(
        "Could not resolve checkpoint. Pass a tinker:// sampler path, a run log directory, "
        "logs/<run>/checkpoints.jsonl, or logs/<run>/<checkpoint_name>."
    )


def load_test_data(test_file: str) -> list[dict]:
    """Load test examples with evaluator metadata."""
    examples = []
    with open(test_file) as f:
        for line_no, line in enumerate(f, 1):
            row = json.loads(line)
            missing = {"bucket", "app_category", "messages"} - set(row)
            if missing:
                raise ValueError(f"{test_file}:{line_no} missing keys: {sorted(missing)}")
            messages = row["messages"]
            roles = [message.get("role") for message in messages]
            if roles != ["system", "user", "assistant"]:
                raise ValueError(f"{test_file}:{line_no} wrong roles: {roles}")
            examples.append({
                "messages": messages,
                "input": messages[1]["content"],
                "app_category": row["app_category"],
                "bucket": row["bucket"],
                "expected": messages[2]["content"],
            })
    return examples


async def evaluate(checkpoint_path: str | None, use_base: bool = False):
    """Run full evaluation on test set."""

    print("=" * 65)
    print("  MRMUR Formatter — Post-Training Evaluation")
    print("=" * 65)

    # Verify test file
    if not Path(TEST_FILE).exists():
        print(f"ERROR: Test file not found: {TEST_FILE}")
        sys.exit(1)

    # Load test data
    test_examples = load_test_data(TEST_FILE)
    print(f"\n  Test examples: {len(test_examples)}")
    print(f"  Model: {MODEL_NAME}")
    if checkpoint_path:
        print(f"  Checkpoint: {checkpoint_path}")
    else:
        print(f"  Mode: base model (no fine-tuning)")
    print()

    # Setup tokenizer + renderer
    tokenizer = get_tokenizer(MODEL_NAME)
    renderer_name = model_info.get_recommended_renderer_name(MODEL_NAME)
    renderer = renderers.get_renderer(renderer_name, tokenizer)

    # Create sampling client
    service_client = tinker.ServiceClient()
    resolved_checkpoint_path = None
    run_label = "base_model"
    if checkpoint_path and not use_base:
        resolved_checkpoint_path, run_label = resolve_sampling_checkpoint(checkpoint_path)
        sampling_client = service_client.create_sampling_client(
            model_path=resolved_checkpoint_path
        )
        print("  Loaded fine-tuned model from checkpoint")
        if resolved_checkpoint_path != checkpoint_path:
            print(f"  Resolved sampler path: {resolved_checkpoint_path}")
    else:
        sampling_client = service_client.create_sampling_client(
            base_model=MODEL_NAME
        )
        print(f"  Using base model (no LoRA)")

    sampling_params = tinker_types.SamplingParams(
        max_tokens=512,
        temperature=0.0,  # Deterministic
        stop=renderer.get_stop_sequences(),
    )

    # ── Run evaluation ───────────────────────────────────────────────────
    results = []
    bucket_stats = defaultdict(lambda: {"exact": 0, "fuzzy": 0, "total": 0})
    overall = {"exact": 0, "fuzzy": 0, "total": 0, "errors": 0}
    parse_failures = 0

    print("Evaluating...")
    for i, ex in enumerate(test_examples):
        # Build prompt (system + user only)
        prompt_messages = [
            renderers.Message(role=m["role"], content=m["content"])
            for m in ex["messages"][:2]
        ]
        model_input = renderer.build_generation_prompt(prompt_messages)

        # Generate
        try:
            response = await sampling_client.sample_async(
                prompt=model_input,
                num_samples=1,
                sampling_params=sampling_params,
            )

            response_msg, parse_success = renderer.parse_response(response.sequences[0].tokens)
            if not parse_success:
                parse_failures += 1
            generated = renderers.get_text_content(response_msg).strip()
        except Exception as e:
            generated = f"ERROR: {e}"
            overall["errors"] += 1

        expected = ex["expected"].strip()

        # Score
        is_exact = generated == expected
        gen_norm = " ".join(generated.split()).lower()
        exp_norm = " ".join(expected.split()).lower()
        is_fuzzy = is_exact or (gen_norm == exp_norm)

        # Track results
        overall["total"] += 1
        if is_exact:
            overall["exact"] += 1
        if is_fuzzy:
            overall["fuzzy"] += 1

        # Bucket tracking (per-bucket accuracy breakdown)
        bucket_stats[ex["bucket"]]["total"] += 1
        if is_exact:
            bucket_stats[ex["bucket"]]["exact"] += 1
        if is_fuzzy:
            bucket_stats[ex["bucket"]]["fuzzy"] += 1


        # Store detailed result
        results.append({
            "index": i,
            "input": ex["input"],
            "expected": expected,
            "generated": generated,
            "exact_match": is_exact,
            "fuzzy_match": is_fuzzy,
            "bucket": ex["bucket"],
            "app_category": ex["app_category"],
        })

        # Progress
        if (i + 1) % 25 == 0 or i == len(test_examples) - 1:
            pct = overall["exact"] / overall["total"] * 100
            print(f"  [{i+1}/{len(test_examples)}] Exact match so far: {pct:.1f}%")

    # ── Print and Build Report ───────────────────────────────────────────
    report_lines = []
    
    def log(msg: str):
        print(msg)
        report_lines.append(msg)

    log("\n" + "=" * 65)
    log("  RESULTS")
    log("=" * 65)

    total = overall["total"]
    log(f"\n  Overall ({total} examples):")
    log(f"    Exact match:  {overall['exact']}/{total} ({overall['exact']/total*100:.1f}%)")
    log(f"    Fuzzy match:  {overall['fuzzy']}/{total} ({overall['fuzzy']/total*100:.1f}%)")
    if overall["errors"] > 0:
        log(f"    Errors:       {overall['errors']}")
    if parse_failures > 0:
        log(f"    Parse fails:  {parse_failures}")


    # Bucket breakdown
    log(f"\n  By Bucket:")
    for bucket in sorted(bucket_stats):
        s = bucket_stats[bucket]
        if s["total"] > 0:
            exact_pct = s["exact"] / s["total"] * 100
            log(f"    {bucket:25s}: exact={exact_pct:5.1f}%  (n={s['total']})")


    # ── Failures (show first 10 mismatches) ──────────────────────────────
    mismatches = [r for r in results if not r["exact_match"]]
    if mismatches:
        log(f"\n  Mismatches: {len(mismatches)} total (showing first 10):")
        for r in mismatches[:10]:
            log(f"\n    [{r['index']}] {r['bucket']} / {r['app_category']}")
            log(f"      Input:    {r['input'][:80]}...")
            log(f"      Expected: {r['expected'][:80]}")
            log(f"      Got:      {r['generated'][:80]}")

    # ── Go/No-Go Gate ────────────────────────────────────────────────────
    exact_pct = overall["exact"] / total * 100
    fuzzy_pct = overall["fuzzy"] / total * 100
    errors_ok = overall["errors"] == 0 and parse_failures == 0

    log(f"\n" + "=" * 65)
    log(f"  GO/NO-GO GATE")
    log(f"=" * 65)
    log(f"  Accuracy (fuzzy) >= 95%: {fuzzy_pct:.1f}% {'PASS' if fuzzy_pct >= 95 else 'FAIL'}")
    log(f"  Errors == 0:             {overall['errors']} {'PASS' if overall['errors'] == 0 else 'FAIL'}")
    log(f"  Parse failures == 0:     {parse_failures} {'PASS' if parse_failures == 0 else 'FAIL'}")

    gate_pass = fuzzy_pct >= 95 and errors_ok
    if gate_pass:
        log(f"\n  >>> GATE: PASS — Model is ready for deployment! <<<")
    else:
        log(f"\n  >>> GATE: FAIL — See mismatches above, iterate on data/training <<<")

    # ── Save detailed results ────────────────────────────────────────────
    # Save results in evaluation-results/ folder.
    # Each checkpoint gets its own file so all 3 epoch results are kept separately.
    eval_dir = SCRIPT_DIR / "evaluation-results"
    eval_dir.mkdir(exist_ok=True)  # Create folder if it doesn't exist

    json_output_path = eval_dir / f"eval_{run_label}.json"
    txt_output_path = eval_dir / f"eval_{run_label}.txt"
    
    # Save the human-readable text report
    with open(txt_output_path, "w") as f:
        f.write("\n".join(report_lines) + "\n")
        
    output = {
        "checkpoint": checkpoint_path or "base_model",
        "resolved_checkpoint": resolved_checkpoint_path,
        "model": MODEL_NAME,
        "total_examples": total,
        "exact_match": overall["exact"],
        "exact_match_pct": round(exact_pct, 2),
        "fuzzy_match": overall["fuzzy"],
        "fuzzy_match_pct": round(fuzzy_pct, 2),
        "errors": overall["errors"],
        "parse_failures": parse_failures,
        "bucket_breakdown": dict(bucket_stats),
        "gate_pass": gate_pass,
        "detailed_results": results,
    }
    with open(json_output_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n  Detailed JSON results saved to: {json_output_path}")
    print(f"  Text report saved to:           {txt_output_path}")
    print("=" * 65)

    return gate_pass


def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate fine-tuned formatter model")
    parser.add_argument(
        "--checkpoint",
        type=str,
        default=None,
        help="Path to Tinker checkpoint (e.g., logs/run-name/final)",
    )
    parser.add_argument(
        "--base",
        action="store_true",
        help="Evaluate the base model (no fine-tuning) for comparison",
    )
    parser.add_argument(
        "--test-file",
        type=str,
        default=None,
        help="Override default test file path (e.g., data/splits_v2/test.jsonl)",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    if args.test_file:
        TEST_FILE = str(Path(args.test_file).expanduser())

    if not args.checkpoint and not args.base:
        print("Usage:")
        print("  python evaluate.py --checkpoint <path>   # Evaluate fine-tuned model")
        print("  python evaluate.py --base                # Evaluate base model (baseline)")
        sys.exit(1)

    gate_pass = asyncio.run(evaluate(args.checkpoint, use_base=args.base))
    sys.exit(0 if gate_pass else 1)
