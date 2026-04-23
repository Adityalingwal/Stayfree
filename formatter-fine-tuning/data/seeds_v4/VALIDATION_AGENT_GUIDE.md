# Validation Dataset Agent Guide
**File:** `formatter-fine-tuning/data/seeds_v4/validation.jsonl`  
**Goal:** Maintain exactly **50 high-quality, aligned examples per bucket** in the validation set.

---

## CURRENT STATUS (as of 2026-04-23)

| Bucket | Count | Status |
|---|---|---|
| `basic_formatting` | 50 | ✅ DONE |
| `numbers_formatting` | 50 | ✅ DONE |
| `self_correction` | 50 | ✅ DONE |
| `hinglish` | 51 | ⚠️ SKIP (managed separately) |
| `voice_commands` | 2 | ❌ NEEDS 50 |
| `asr_errors` | 0 | ❌ NEEDS 50 |
| `edge_cases` | 5 | ❌ NEEDS 50 |
| `email_context` | 0 | ⛔ SKIP (separate team) |

---

## HOW THE JSONL FILE IS STRUCTURED

Each example is a pretty-printed JSON object separated by a blank line:

```json
{
  "input": "raw asr text exactly as spoken",
  "output": "Formatted clean output.",
  "bucket": "bucket_name_here"
}
```

**Rules:**
- `input`: Lowercase, no punctuation, exactly as ASR would produce it
- `output`: Properly formatted — capitalized, punctuated, symbols used directly (never Unicode escapes)
- `bucket`: One of the bucket names in the table above
- No `app_category` field — it was removed
- File written with `ensure_ascii=False` — always use this when writing with Python

**Python write pattern (ALWAYS use this):**
```python
import json

with open('validation.jsonl', 'w', encoding='utf-8') as f:
    for i, d in enumerate(data):
        f.write(json.dumps(d, indent=2, ensure_ascii=False))
        if i < len(data) - 1:
            f.write('\n\n')
```

**Python parse pattern (ALWAYS use this — file is pretty-printed, not line-by-line):**
```python
import json

with open('validation.jsonl', 'r', encoding='utf-8') as f:
    content = f.read()

decoder = json.JSONDecoder()
data = []
idx = 0
while idx < len(content):
    while idx < len(content) and content[idx] in ' \t\n\r':
        idx += 1
    if idx >= len(content):
        break
    try:
        obj, end = decoder.raw_decode(content, idx)
        data.append(obj)
        idx = end
    except json.JSONDecodeError:
        idx += 1
```

---

## STEP-BY-STEP PROCESS FOR EACH BUCKET

Follow these exact steps for each bucket that needs work:

### Step 1: Read the System Prompt Rules
Read `formatter-fine-tuning/general_prompt.txt` in full.  
Identify the rules specific to your target bucket (e.g., NUMBERS AND FORMATS section for numbers_formatting).

### Step 2: Read the Training Data Patterns
Read the training seed file for that bucket:
- `formatter-fine-tuning/data/seeds_v4/<bucket_name>.jsonl`
  
Identify **what patterns the model is being trained on**. Your validation must test THESE patterns, not invent new ones.

### Step 3: Audit Current Validation Examples
Read all current examples for that bucket from `validation.jsonl`.  
Check each one for:
- **Alignment**: Does the output follow the exact same rule the training data teaches?
- **Terminal punctuation**: All non-fragment sentences must end with `.`, `?`, or `!`
- **Capitalization**: First word of output must be capitalized (except Hinglish)
- **No Unicode escapes**: Use actual `₹`, `×`, `—`, `$` symbols, not `\u20b9`, `\u00d7`, etc.
- **No missing partial outputs**: No truncated outputs like `The budget is ,000.` (missing `$`)
- **No wrong triggers**: Only use pivot words that are in the training data (e.g., for self_correction only `no wait`, `wait no`, `actually`, `no actually`, `sorry`, `correction` — NOT `I mean` or `scratch that`)

### Step 4: Remove Bad Examples
Remove ALL existing examples for that bucket from validation.jsonl.  
Do NOT try to patch them one by one — replace all 50 at once.

### Step 5: Generate 50 Fresh Examples
Create exactly 50 new input/output pairs.  
**Rules for generating:**
- Inputs must be **unseen** — do not copy inputs from training files verbatim
- Cover all the sub-patterns the training data covers (e.g., for numbers: times, dates, currency, percentages, tech, vague quantities)
- Divide evenly across sub-patterns (e.g., 10 per sub-pattern if 5 sub-patterns)
- No duplicate inputs
- Wording must vary — don't use the same sentence structure repeatedly

### Step 6: Write to validation.jsonl
Place the new 50 examples in the correct position in the file:  
**Order:** `basic_formatting` → `numbers_formatting` → `self_correction` → `voice_commands` → `asr_errors` → `edge_cases` → `hinglish`

Use the Python write pattern above with `ensure_ascii=False`.

### Step 7: Run Sanity Check
Run the following sanity check script:

```python
import json, re

with open('formatter-fine-tuning/data/seeds_v4/validation.jsonl', 'r', encoding='utf-8') as f:
    content = f.read()

decoder = json.JSONDecoder()
data = []
idx = 0
while idx < len(content):
    while idx < len(content) and content[idx] in ' \t\n\r':
        idx += 1
    if idx >= len(content):
        break
    try:
        obj, end = decoder.raw_decode(content, idx)
        data.append(obj)
        idx = end
    except json.JSONDecodeError:
        idx += 1

issues = []
for i, d in enumerate(data):
    out = d.get('output', '')
    inp = d.get('input', '')
    bucket = d.get('bucket', '')

    # Unicode escape check
    raw = json.dumps(d)
    if '\\u' in raw:
        issues.append((i, bucket, inp[:50], 'Contains Unicode escape sequences'))

    # Empty output check
    if out == '' and not re.match(r'^(uh|um|hmm|er|erm|ugh|ah|\s)+$', inp.lower()):
        issues.append((i, bucket, inp[:50], 'Unexpectedly empty output'))

    # Capitalization check (skip hinglish)
    if bucket != 'hinglish' and out and out[0].islower():
        issues.append((i, bucket, inp[:50], 'Output not capitalized'))

    # Terminal punctuation check
    if bucket in ['basic_formatting', 'numbers_formatting', 'self_correction', 'voice_commands', 'asr_errors', 'edge_cases']:
        if out and not re.search(r'[.?!\'\")\]]$', out.strip()):
            issues.append((i, bucket, inp[:50], f'Missing terminal punctuation, ends with: ...{out[-20:]}'))

if issues:
    for i, bucket, inp, reason in issues:
        print(f'[{i}] [{bucket}] {reason}: {inp}')
else:
    print('All clean!')
```

---

## BUCKET-SPECIFIC RULES REFERENCE

### `voice_commands`
**What to validate:** Voice command words replaced with actual symbols/structure.  
**Training file:** `formatter-fine-tuning/data/seeds_v4/voice_commands.jsonl`  
**Key rules from prompt:**
- `"new line"` / `"newline"` → `\n`
- `"period"` / `"full stop"` / `"dot"` → `.`
- `"comma"` → `,`
- `"question mark"` → `?`
- `"open parenthesis"` → `(`
- `"close parenthesis"` → `)`
- `"dash"` / `"hyphen"` → `—`
- `"open quote"` / `"begin quote"` → `"`
- `"at sign"` / `"at the rate"` → `@`
- Do NOT replace when clearly natural speech: `"question mark on my face"`, `"period of time"`
- Pass through unchanged: `"select all"`, `"caps on"`, `"caps off"`

**Sub-patterns to cover (10 examples each):**
1. Structure commands (new line, new paragraph, tab)
2. Punctuation commands (period, comma, question mark, exclamation)
3. Bracket/quote commands (open parenthesis, close parenthesis, open quote)
4. Symbol commands (at sign, hashtag, ampersand, percent, dollar sign)
5. Mixed: command + natural speech in the same sentence

---

### `asr_errors`
**What to validate:** ASR artifacts preserved as-is, not over-corrected.  
**Training file:** `formatter-fine-tuning/data/seeds_v4/asr_errors.jsonl`  
**Key rules from prompt:**
- Do NOT correct misheard words — if ASR gave `"male"` instead of `"mail"`, keep `"male"`
- Do NOT remove garbled text — format as-is with proper capitalization/punctuation
- `♪` or `[BLANK_AUDIO]` on its own → return empty string `""`
- If `♪` is mixed with real content → remove only the marker, keep real content
- Partial cut words: keep EXACTLY as-is — `"sto"` stays `"sto"`, no dash added
- English phrases like `"thank you for watching"` — keep as dictated, do NOT remove

**Sub-patterns to cover (10 examples each):**
1. Homophones/misheard words preserved (male/mail, their/there, write/right)
2. Garbled/partial words formatted with correct capitalization
3. Music note `♪` / `[BLANK_AUDIO]` → empty string output
4. Mixed content with hallucination markers — only marker removed
5. Partial cut words (mid-word audio cut) preserved exactly

---

### `edge_cases`
**What to validate:** Unusual ASR inputs handled gracefully.  
**Training file:** `formatter-fine-tuning/data/seeds_v4/edge_cases.jsonl`  
**Key rules from prompt:**
- Incomplete thoughts / trailing off: do NOT force a period on an obviously unfinished fragment
- Single word: `"hello"` → `"Hello."` ; `"hmm"`, `"ugh"` → `""` (pure filler → empty)
- Questions always get `?`, even rhetorical
- Quoted speech: `"John said I'll be there at five"` → `"John said, 'I'll be there at 5.'"`
- Keep laughter `"haha"`, exclamations `"wow"`, `"whoa"`
- Contractions preserved EXACTLY as spoken — never expand or contract

**Sub-patterns to cover (10 examples each):**
1. Single word / pure filler inputs
2. Trailing/incomplete fragments (no forced period)
3. Rhetorical questions (must get `?`)
4. Quoted speech formatting
5. Expressive content (laughter, exclamations, contractions)

---

## IMPORTANT: WHAT NOT TO DO

- ❌ Do NOT invent new formatting rules not in `general_prompt.txt`
- ❌ Do NOT use Unicode escapes (`\u20b9`) — use actual symbols (`₹`)
- ❌ Do NOT add `app_category` field — it was removed
- ❌ Do NOT add `$` or `₹` unless the speaker explicitly said "dollars" or "rupees"/"rupaye"
- ❌ Do NOT translate Hinglish — keep exact mix as spoken
- ❌ Do NOT contract spoken words (`"do not"` → `"don't"`) or expand contractions (`"don't"` → `"do not"`)
- ❌ Do NOT use `json.dumps()` without `ensure_ascii=False` — it will corrupt ₹, ×, — symbols
- ❌ Do NOT modify `hinglish` or `email_context` buckets — they are managed separately
- ❌ Do NOT add more than 50 examples per bucket — exactly 50

---

## FINAL VALIDATION CHECKLIST (run after every bucket)

```
[ ] 50 examples in the bucket (not 49, not 51)
[ ] All inputs are lowercase with no punctuation
[ ] All outputs are properly capitalized
[ ] All outputs end with correct terminal punctuation
[ ] No Unicode escapes in the file (grep for \u to verify)
[ ] No app_category field anywhere
[ ] All bucket names are correct strings
[ ] File written with ensure_ascii=False
[ ] Python sanity check script passes with "All clean!"
```
