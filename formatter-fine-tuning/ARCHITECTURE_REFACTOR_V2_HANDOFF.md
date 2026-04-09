# Formatter Fine-Tuning Refactor v2 (Handoff for Review)

Date: 2026-04-10 (Asia/Kolkata)

This doc captures the **new data contract + pipeline architecture** for fine-tuning the StayFree/MRMUR formatter on Tinker, plus the key sanity checks and Q&A clarifications discussed during implementation.

## Goals

- Use `system_prompt_v3.txt` as the **canonical** formatter prompt (shorter, safer, and production-aligned).
- Move per-example context into the **system prompt**:
  - style (`Formal`/`Casual`)
  - `app_name`
  - `app_category`
  - `dictionary` entries
- Keep the `user` message **clean transcript only** (ASR output).
- Keep `assistant` message as the **expected formatted output**.
- Ensure **no cross-split leakage** of duplicate `(input, output)` transformations.
- Remove the older pipeline behavior where user message carried JSON payload, and a “prepared file” stage re-rendered prompts.

## Old vs New Contract

### Old contract (deprecated)

- `system` prompt contained placeholders like `{style_preset}`, `{app_category}`, `{app_name}`, `{dictionary_entries}`.
- `user` message was a JSON string containing `input/style/app_name/app_category/dictionary`.
- Extra “prepared split” stage rewrote the system prompt by parsing user JSON and rendering placeholders.

### New contract (active)

- `system` prompt is **already rendered** per-row from `system_prompt_v3.txt` (no placeholders should remain).
- `user` message is **plain text transcript** only.
- `assistant` message is formatted output.
- `train.jsonl` and `val.jsonl` are **messages-only** JSONL.
- `test.jsonl` includes metadata (for reporting) + `messages`.

## Canonical Prompt

File: `system_prompt_v3.txt`

Placeholders expected in template:

- `{style_preset}`
- `{app_category}`
- `{app_name}`
- `{dictionary_entries}`

Rendering rules:

- Dictionary is deterministic:
  - empty dict → `- None`
  - non-empty → sorted keys → `- "term" -> "replacement"`
- After rendering, **no placeholders should remain** in the final `system` content.

## Sources of Truth and Generated Artifacts

### Source of truth

- `data/seeds/*.jsonl`
  - Each line is a seed row with:
    - `input`, `output`, `style`, `app_name`, `app_category`, `dictionary`
  - The seed filename (stem) is treated as `source_bucket` during split generation.

### Generated artifacts (safe to overwrite/regenerate)

- `data/splits/train.jsonl`
- `data/splits/val.jsonl`
- `data/splits/test.jsonl`

These are generated deterministically and should not be hand-edited.

## Split Formats (Exact)

### Train + Val schema (messages-only)

Each line is:

```json
{
  "messages": [
    { "role": "system", "content": "<rendered system prompt>" },
    { "role": "user", "content": "<clean transcript>" },
    { "role": "assistant", "content": "<expected formatted output>" }
  ]
}
```

No top-level `style/app_name/app_category/dictionary` in train/val by design.

### Test schema (metadata + messages)

Each line is:

```json
{
  "source_bucket": "<seed filename stem>",
  "style": "Formal|Casual",
  "app_name": "<app>",
  "app_category": "Work|Personal|Email|Other",
  "dictionary": { "<term>": "<replacement>" },
  "messages": [
    { "role": "system", "content": "<rendered system prompt>" },
    { "role": "user", "content": "<clean transcript>" },
    { "role": "assistant", "content": "<expected formatted output>" }
  ]
}
```

Rationale: evaluation/reporting needs metadata; training does not.

## Split Algorithm (Leakage Prevention)

Key idea: keep duplicates together.

- We group seed rows by `(input, output)`.
- We shuffle groups deterministically with seed `42`.
- We assign groups to splits targeting ~80/10/10 ratios.

Effect:
- The same transformation (same `(input, output)`) cannot appear in both train and val/test.
- Validation and test are more trustworthy (no inflated metrics).

## What Each Script Does

### `prompt_utils.py`

- Loads `system_prompt_v3.txt`
- Renders per-row system prompt from row fields
- Builds final `messages` list:
  - `system`: rendered prompt
  - `user`: transcript only (`input`)
  - `assistant`: formatted output (`output`)

### `prepare_training_data.py`

- Loads all seed rows from `data/seeds/*.jsonl`
- Attaches `source_bucket` from filename stem
- Performs duplicate-aware splitting by `(input, output)` groups
- Writes:
  - `train.jsonl` (messages-only)
  - `val.jsonl` (messages-only)
  - `test.jsonl` (metadata + messages)

Counts after generation (current state):
- train: 1654
- val: 207
- test: 206
- total: 2067

### `train.py`

- Trains using Tinker cookbook `FromConversationFileBuilder` on `train.jsonl`
- Uses val set for:
  - NLL eval (every 10 steps)
  - generation evaluator (every 25 steps)
- Keeps dataset shuffle enabled (`shuffle_seed=42`) to avoid blockwise ordering.
- Derives `MAX_LENGTH` from actual split token lengths:
  - `max_observed + 128`, rounded up to next 512.

Token stats (from verifier run):
- train min/p50/p95/max: 3155 / 3183 / 3255 / 3316
- val   min/p50/p95/max: 3154 / 3182 / 3248 / 3272
- test  min/p50/p95/max: 3156 / 3182 / 3247 / 3283
- Recommended `MAX_LENGTH`: 3584

Rough cost estimate for the current run config:
- train: ~$8.45
- val NLL: ~$0.86
- custom generation eval: extra (small relative to above)

### `evaluate.py`

- Loads `test.jsonl`
- Uses `row["messages"]` as-is for model input (no user JSON parsing)
- Reports:
  - overall exact/fuzzy
  - style breakdown
  - source-bucket breakdown
  - category+style breakdown
  - latency percentiles

### `verify_setup.py`

This is the “gatekeeper” sanity check.

It verifies:
- Split schemas:
  - train/val: keys exactly `{"messages"}`
  - test: keys exactly `{"source_bucket","style","app_name","app_category","dictionary","messages"}`
- Roles are exactly: `system`, `user`, `assistant`
- System prompt has **no placeholder tokens**
- Actual split files match deterministic regeneration from seeds
- Cross-split overlap check:
  - no duplicate `(input, output)` in more than one split
- Distribution audit (warn-only):
  - style/category share doesn’t drift too far from corpus
  - buckets with >=20 rows shouldn’t be missing from both val and test
- Token audit + recommended `MAX_LENGTH` (requires tokenizer availability; will download if not cached)

## Q&A / Doubts Addressed (Summary)

1. “System prompt placeholders fill ho rahe hain ya literal reh jaate hain?”
   - Yes, placeholders are rendered per-row into the `system` message.
   - We explicitly check that no `{style_preset}` etc remain.

2. “User message clean hona chahiye; context user JSON mein kyon bhejna?”
   - New contract: user message is clean transcript; context is system.
   - This matches production and avoids JSON-parsing behavior.

3. “Kya train/val/test overlap ho raha hai?”
   - No. Duplicate-aware grouping by `(input, output)` prevents leakage.
   - Verified via overlap check in `verify_setup.py`.

4. “Kya rows ‘sticky’ ho jaati hain? Slack ke baad sab Slack train ho jayega?”
   - No. JSONL rows are independent examples.
   - Training data is shuffled by the dataset builder (`shuffle_seed=42`).
   - Some short same-app streaks are normal in a shuffled stream.

5. “Prompt bahut long hai; cost/latency ka kya?”
   - `system_prompt_v3.txt` reduced prompt size substantially versus the old giant prompt.
   - Verified token stats show ~3.2k tokens/example.
   - Rough cost estimate provided (train ~$8.45 for 4 epochs).

6. “KV cache training mein tokens ‘free’ ho jaate hain?”
   - For training-cost planning, assume tokens are processed per-example.
   - Inference caching can help, but training is not “free-prefix”.

## Commands (Runbook)

Sanity gate before any paid training run:

```bash
cd formatter-fine-tuning
.venv/bin/python prepare_training_data.py
.venv/bin/python verify_setup.py
```

Training:

```bash
cd formatter-fine-tuning
.venv/bin/python train.py
```

Post-training evaluation:

```bash
cd formatter-fine-tuning
.venv/bin/python evaluate.py --checkpoint logs/<run>/final
```

## Reviewer Notes (What to Review First)

- Data contract correctness:
  - Are system context fields correct per-row?
  - Is user transcript clean (not JSON)?
  - Is train/val messages-only and test metadata+messages?
- Leakage prevention:
  - Grouping by `(input, output)` is the intended policy (agree/disagree).
- Prompt semantics:
  - Any rule that may cause “adding words not spoken” should be flagged early.
- Cost vs quality:
  - ~3.2k tokens/example is acceptable with current budget; further reductions can be explored later.
