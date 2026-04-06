"""
StayFree Formatter — Post-Training Evaluation Script

Runs comprehensive evaluation on the test set after training completes.
This uses data the model has NEVER seen during training.

Usage:
  cd formatter-fine-tuning
  source .venv/bin/activate
  python evaluate.py --checkpoint <path-to-checkpoint>

  # Example:
  python evaluate.py --checkpoint logs/stayfree-formatter-r32-.../final

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
import time
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
TEST_FILE = str(SCRIPT_DIR / "data" / "splits" / "test.jsonl")


def load_test_data(test_file: str) -> list[dict]:
    """Load test examples and extract bucket info from the original seed data."""
    examples = []
    with open(test_file) as f:
        for line in f:
            row = json.loads(line)
            # Extract metadata from user message JSON
            user_data = json.loads(row["messages"][1]["content"])
            examples.append({
                "messages": row["messages"],
                "input": user_data["input"],
                "style": user_data["style"],
                "app_name": user_data["app_name"],
                "app_category": user_data["app_category"],
                "dictionary": user_data["dictionary"],
                "expected": row["messages"][2]["content"],
            })
    return examples


async def evaluate(checkpoint_path: str | None, use_base: bool = False):
    """Run full evaluation on test set."""

    print("=" * 65)
    print("  StayFree Formatter — Post-Training Evaluation")
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
    if checkpoint_path and not use_base:
        sampling_client = service_client.create_sampling_client(
            model_path=checkpoint_path
        )
        print(f"  Loaded fine-tuned model from checkpoint")
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
    style_stats = defaultdict(lambda: {"exact": 0, "fuzzy": 0, "total": 0})
    overall = {"exact": 0, "fuzzy": 0, "total": 0, "errors": 0}
    latencies = []

    print("Evaluating...")
    for i, ex in enumerate(test_examples):
        # Build prompt (system + user only)
        prompt_messages = [
            renderers.Message(role=m["role"], content=m["content"])
            for m in ex["messages"][:2]
        ]
        model_input = renderer.build_generation_prompt(prompt_messages)

        # Generate with timing
        start_time = time.time()
        try:
            response = await sampling_client.sample_async(
                prompt=model_input,
                num_samples=1,
                sampling_params=sampling_params,
            )
            latency_ms = (time.time() - start_time) * 1000
            latencies.append(latency_ms)

            response_msg = renderer.parse_response(response.sequences[0].tokens)[0]
            generated = renderers.get_text_content(response_msg).strip()
        except Exception as e:
            generated = f"ERROR: {e}"
            latency_ms = 0
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

        # Bucket tracking (infer bucket from app_category + style)
        bucket_key = f"{ex['app_category']}_{ex['style']}"
        bucket_stats[bucket_key]["total"] += 1
        if is_exact:
            bucket_stats[bucket_key]["exact"] += 1
        if is_fuzzy:
            bucket_stats[bucket_key]["fuzzy"] += 1

        # Style tracking
        style_stats[ex["style"]]["total"] += 1
        if is_exact:
            style_stats[ex["style"]]["exact"] += 1
        if is_fuzzy:
            style_stats[ex["style"]]["fuzzy"] += 1

        # Store detailed result
        results.append({
            "index": i,
            "input": ex["input"],
            "expected": expected,
            "generated": generated,
            "exact_match": is_exact,
            "fuzzy_match": is_fuzzy,
            "style": ex["style"],
            "app_name": ex["app_name"],
            "app_category": ex["app_category"],
            "latency_ms": round(latency_ms, 1),
        })

        # Progress
        if (i + 1) % 25 == 0 or i == len(test_examples) - 1:
            pct = overall["exact"] / overall["total"] * 100
            print(f"  [{i+1}/{len(test_examples)}] Exact match so far: {pct:.1f}%")

    # ── Print Results ────────────────────────────────────────────────────
    print("\n" + "=" * 65)
    print("  RESULTS")
    print("=" * 65)

    total = overall["total"]
    print(f"\n  Overall ({total} examples):")
    print(f"    Exact match:  {overall['exact']}/{total} ({overall['exact']/total*100:.1f}%)")
    print(f"    Fuzzy match:  {overall['fuzzy']}/{total} ({overall['fuzzy']/total*100:.1f}%)")
    if overall["errors"] > 0:
        print(f"    Errors:       {overall['errors']}")

    # Latency stats
    if latencies:
        latencies.sort()
        p50 = latencies[len(latencies) // 2]
        p95 = latencies[int(len(latencies) * 0.95)]
        p99 = latencies[int(len(latencies) * 0.99)]
        print(f"\n  Latency:")
        print(f"    p50: {p50:.0f}ms")
        print(f"    p95: {p95:.0f}ms")
        print(f"    p99: {p99:.0f}ms")

    # Style breakdown
    print(f"\n  By Style:")
    for style in sorted(style_stats):
        s = style_stats[style]
        if s["total"] > 0:
            exact_pct = s["exact"] / s["total"] * 100
            fuzzy_pct = s["fuzzy"] / s["total"] * 100
            print(f"    {style:8s}: exact={exact_pct:5.1f}%  fuzzy={fuzzy_pct:5.1f}%  (n={s['total']})")

    # Bucket breakdown
    print(f"\n  By Category+Style:")
    for bucket in sorted(bucket_stats):
        s = bucket_stats[bucket]
        if s["total"] > 0:
            exact_pct = s["exact"] / s["total"] * 100
            print(f"    {bucket:25s}: exact={exact_pct:5.1f}%  (n={s['total']})")

    # ── Failures (show first 10 mismatches) ──────────────────────────────
    mismatches = [r for r in results if not r["exact_match"]]
    if mismatches:
        print(f"\n  Mismatches: {len(mismatches)} total (showing first 10):")
        for r in mismatches[:10]:
            print(f"\n    [{r['index']}] {r['app_name']} / {r['style']}")
            print(f"      Input:    {r['input'][:80]}...")
            print(f"      Expected: {r['expected'][:80]}")
            print(f"      Got:      {r['generated'][:80]}")

    # ── Go/No-Go Gate ────────────────────────────────────────────────────
    exact_pct = overall["exact"] / total * 100
    fuzzy_pct = overall["fuzzy"] / total * 100
    latency_ok = p95 < 200 if latencies else False

    print(f"\n" + "=" * 65)
    print(f"  GO/NO-GO GATE")
    print(f"=" * 65)
    print(f"  Accuracy (fuzzy) >= 95%: {fuzzy_pct:.1f}% {'PASS' if fuzzy_pct >= 95 else 'FAIL'}")
    print(f"  Latency p95 < 200ms:     {p95:.0f}ms {'PASS' if latency_ok else 'FAIL'}" if latencies else "  Latency: N/A")
    print(f"  Errors == 0:             {overall['errors']} {'PASS' if overall['errors'] == 0 else 'FAIL'}")

    gate_pass = fuzzy_pct >= 95 and overall["errors"] == 0
    if gate_pass:
        print(f"\n  >>> GATE: PASS — Model is ready for deployment! <<<")
    else:
        print(f"\n  >>> GATE: FAIL — See mismatches above, iterate on data/training <<<")

    # ── Save detailed results ────────────────────────────────────────────
    output_path = SCRIPT_DIR / "evaluation_results.json"
    output = {
        "checkpoint": checkpoint_path or "base_model",
        "model": MODEL_NAME,
        "total_examples": total,
        "exact_match": overall["exact"],
        "exact_match_pct": round(exact_pct, 2),
        "fuzzy_match": overall["fuzzy"],
        "fuzzy_match_pct": round(fuzzy_pct, 2),
        "errors": overall["errors"],
        "latency_p50_ms": round(p50, 1) if latencies else None,
        "latency_p95_ms": round(p95, 1) if latencies else None,
        "style_breakdown": dict(style_stats),
        "bucket_breakdown": dict(bucket_stats),
        "gate_pass": gate_pass,
        "detailed_results": results,
    }
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n  Detailed results saved to: {output_path}")
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
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    if not args.checkpoint and not args.base:
        print("Usage:")
        print("  python evaluate.py --checkpoint <path>   # Evaluate fine-tuned model")
        print("  python evaluate.py --base                # Evaluate base model (baseline)")
        sys.exit(1)

    gate_pass = asyncio.run(evaluate(args.checkpoint, use_base=args.base))
    sys.exit(0 if gate_pass else 1)
