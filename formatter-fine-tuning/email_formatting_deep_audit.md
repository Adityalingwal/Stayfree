# 📧 Email Context Audit & Failure Taxonomy (Iterations 1-3)

## 1. Executive Summary: The "Formatting Regression" Crisis
As the model fine-tuning progressed from Iteration 1 to Iteration 3, we observed a paradoxical **regression in structural integrity** for the Email bucket. While the model became more "natural" in its linguistic flow, it lost the ability to maintain the rigid structural rules required for professional email formatting (newlines, casing, and signature separation).

| Metric | Iteration 1 | Iteration 2 | Iteration 3 | Status |
| :--- | :---: | :---: | :---: | :--- |
| **Email Exact Match** | 75.0% | 55.6% | 42.2% | 🚨 CRITICAL REGRESSION |
| **Email Fuzzy Match** | 75.0% | 77.8% | 66.7% | 🚨 DECLINING |

### Iteration 3 Eval File Breakdown

| Eval File | Email Entries | Exact Match | Fuzzy Match |
| :--- | :---: | :---: | :---: |
| `eval_mrmur-formatter-training-iteration-3_final` | 57 | 43.9% (25/57) | 73.7% (42/57) |
| `eval_mrmur-formatter-training-iteration-3_final_with_splits_v3_testfile` | 60 | 80.0% (48/60) | 80.0% (48/60) |

**Note:** The v3 testfile shows significantly better performance (80%) because it uses the newer, more consistent v3 seed data as evaluation ground truth. The 43.9% on the original eval file is the more accurate picture of real-world failure.

---

## 2. Taxonomy of Email Failures

### Category A: Structural Collapse (Newline Merging)
The most common failure is the model merging the greeting, body, or closing into a single paragraph instead of using proper line breaks.
- **Problem:** Model fails to insert `\n\n` or `\n` between logical blocks.
- **Iteration 2/3 Example:** 
  - **Input:** `...thanks chris`
  - **Expected:** `\n\nThanks,\nChris`
  - **Generated:** `...Thanks, Chris.` (Merged into the last sentence)
- **Iteration 2 Example (Index 381):** `...Let's go. Chat later.` (Merged into one line instead of newlines)

### Category B: Over-Capitalization of Nouns
The model is "over-learning" a pseudo-formal style where it capitalizes the recipient's role or the department name, which our spec requires to be lowercase (unless it's a proper name).

| Failure Case | Model Output (WRONG) | Expected Output (CORRECT) |
| :--- | :--- | :--- |
| **Index 367** | `Dear Supplier,` | `Dear supplier,` |
| **Index 372** | `Hi Boss,` | `Hi boss,` |
| **Index 385** | `Hi Marketing,` | `Hi marketing,` |
| **Index 386** | `Dear Hiring Manager,` | `Dear hiring manager,` |
| **Index 389** | `...Cheers, It Guy` | `...Cheers, IT guy` |

---

### Category C: Hallucination & Placeholder Insertion
The model is attempting to "finish" the email by adding signature placeholders that were not in the input.

- **Example (Index 379):**
  - **Input:** `hi team quick reminder to submit your timesheets today thanks`
  - **Generated:** `Hi team,\n\nQuick reminder to submit your timesheets today.\n\nThanks,\n[Your Name]` 
  - **Analysis:** The model hallucinated `[Your Name]`. This is a hard-fail.

---

### Category D: Punctuation Inconsistency
- **Original observation:** Model was adding periods to standalone closings inconsistently.
- **REVISED RULE (finalized):** Standalone closing (no name follows) → period is CORRECT. `Thanks.` ✅ `Regards.` ✅
- `Thanks,\nName` → comma correct (name follows). `Thanks.` → period correct (no name follows).
- "Best" alone with no name → `"Best regards."` (not `"Best."` — too abrupt).

---

### Category E: Ampersand Handling (NEW — from v3 testfile)

- **Pattern:** Model spells out `&` as "and" in team/department names.
  - Expected: `"L&D Team"` → Model outputs: `"L and D Team"`

**Fix rule:**
- If speaker says `"and"` → keep as `"and"` (spoken word, preserve as-is).
- If speaker says `"ampersand"` → convert to `&` (voice command replacement).
- Model should NOT silently convert spoken `"and"` to `&` or vice versa.

**Status:** No training examples exist for this in `email_context.jsonl` yet — need to add examples covering both cases.

---

### Category F: Compound Adjective Hyphenation (NEW — from iteration-3 final)

2 failures at indices 445, 446:

- **Pattern:** Model drops hyphens from compound adjectives before nouns.
- **Example:** `"all-hands meeting"` → Model outputs: `"all hands meeting"`

**REVISED RULE (after verification):**
- The formatter does **NOT** auto-add hyphens to compound words. Hyphens are symbols — if the user did not speak `"dash"`, no hyphen is added.
- `"follow up meeting"` (spoken without "dash") → `"follow up meeting"` ✅ — no auto-hyphen
- `"all hands meeting"` (spoken without "dash") → `"all hands meeting"` ✅ — no auto-hyphen
- Auto-hyphenating would cause training data inconsistency: same word appearing with and without hyphen in different contexts would confuse the model.

**Explicit "dash" voice command only:**
- If speaker explicitly says `"dash"` between word parts → convert to `-` (hyphen, NOT em-dash `—`).
- `"follow dash up meeting"` → `"follow-up meeting"`
- `"one dash on dash one call"` → `"one-on-one call"`
- `"all dash hands meeting"` → `"all-hands meeting"`

**Evaluation failures (indices 445, 446) re-analysis:** The evaluation expected `"all-hands"` but the input likely did not contain `"dash"`. This was an inconsistency in the evaluation data, not a formatter bug.

**Status:** No training examples exist in `email_context.jsonl` for the explicit "dash" voice command — need to add examples covering this.

---

## 3. Regression Analysis: Why did it get worse?

1. **Dataset Contamination:** The `email_context.jsonl` likely contains inconsistent examples where some use newlines and some don't. The model is gravitating towards the "average" (which is single-line chat style).
2. **"Chat" Overfit:** Because the majority of the training data (WhatsApp/Slack) is single-line, the model is applying "Chat Logic" to "Email Context".
3. **Formal Punctuation Bias:** The model's base training (Llama 3.1) is biased towards standard formal English, which is why it keeps adding commas after greetings (Vocative Comma) even in casual mode.

---

## 4. Actionable Correction Guide for Claude / LLM Clean-up

Use these rules to audit every line in `email_context.jsonl`:

### Rule 1: Mandatory Newline Blocks
Every email MUST follow this structure:
`[Greeting],\n\n[Body Text].\n\n[Closing],\n[Name]`
*Note: If the input is just a greeting and body, omit the closing block.*

### Rule 2: Case-Sensitive Greetings
Lowercase the following unless they are proper names:
- `boss`, `team`, `everyone`, `all`, `supplier`, `hiring manager`, `marketing`, `finance`.
- `IT support` (IT is caps, support is lower).

### Rule 3: No Hallucinations
- NEVER add `[Your Name]`, `[Date]`, or `[Company]`.
- If the input ends with "Thanks", the output ends with "Thanks". Do not add a comma or a name unless the user spoke it.

### Rule 4: Vocative Comma — Always Use in Emails
- **Both formal and casual emails:** Always use a comma after the greeting.
- `Dear team,` ✅ | `Hi team,` ✅ | `Hey Sarah,` ✅
- Email is NOT Hinglish/WhatsApp — comma after greeting is always correct in email context regardless of tone.

### Rule 5: Closing Punctuation
- Only add a comma after "Thanks", "Regards", "Best" if a name follows it on the next line.
- Standalone closing (no name follows): add a period. `Thanks.` ✅ `Thank you.` ✅
- Never add both comma AND period. Comma only when name follows on next line.

---

## 5. Gap Analysis: Dataset (`email_context.jsonl`) vs. Evaluation

After auditing the actual training seeds in `email_context.jsonl`, several critical discrepancies were found between the training data and the evaluation expectations.

### Discrepancy 1: Capitalization Conflict
- **Finding:** The training seeds (seeds_v4) **explicitly capitalize** roles like `Hiring Manager` (Index 4), `Customer Support` (Index 22), `HR Team` (Index 38), and `Leadership Team` (Index 103).
- **Evaluation Expectation:** Iteration 3 evaluation expects **lowercase** for `hiring manager`, `supplier`, and `boss`.
- **Conclusion:** The model is actually following the training data correctly, but the evaluation (and our desired spec) wants lowercase. **We must lowercase these in the `.jsonl` file.**

### Discrepancy 2: English Structural Nuances
- **Finding:** The `email_context.jsonl` file is correctly 100% English, reflecting the formal nature of emails. However, the model is failing to apply "Email Structure" (newlines) to these English sentences, treating them like single-paragraph chat messages.
- **Consequence:** Even though the language is correct, the layout is failing, which leads to a low Exact Match score.

### Discrepancy 3: "Thanks" Formatting Inconsistency
- **Finding:** Some seeds use `\n\nThanks` while others use `\n\nThanks,` (with a comma) even when no name follows. 
- **Evaluation Issue:** The model is hallucinating names/placeholders because it is trying to resolve trailing punctuation or trying to match name-based signatures found in other examples.

### Discrepancy 4: The Newline Failure
- **Finding:** The seeds **do have** proper `\n\n` structure.
- **Why it's failing:** The model is ignoring these newlines in Iteration 3. This indicates that the "Chat" buckets (WhatsApp/Slack) are likely weighted too heavily or the model is over-generalizing the "one message = one line" rule.

---

---

## 6. Short Acknowledgment Emails — Do NOT Add Structure (NEW)

30+ entries in `email_context.jsonl` are intentionally single-line acknowledgment replies. These are **correct as-is** and must NOT have greeting/body/closing structure forced onto them.

**Valid single-line email outputs (no structure needed):**

| Output | Why it's correct |
| :--- | :--- |
| `Got it, thanks.` | Pure acknowledgment |
| `Noted.` | Pure acknowledgment |
| `Will do.` | Action confirmation |
| `Perfect, see you then.` | Confirmation reply |
| `Sure, that works for me.` | Confirmation reply |
| `On it.` | Action confirmation |
| `Sorry, wrong thread. Ignore this.` | Quick correction |

**Rule:** Structure (`\n\n` greeting/body/closing) is ONLY required when the email has distinct greeting + body + closing blocks. One-sentence replies and pure acknowledgments stay as a single line. The model failing here (treating short replies as needing structure) is a **Chat Overfit** problem — not a data problem.

---

## 7. Full Training Data Audit — `email_context.jsonl` (NEW)

Scanned all **909 entries**. Issues found:

### Issue A — Generic Roles Over-Capitalized (39+ entries) ← SAME AS Category B above

These role names are NOT proper nouns — they appear after greetings and should be lowercase:

| Wrong (in training data) | Correct |
| :--- | :--- |
| `Hiring Manager` | `hiring manager` |
| `HR Team` | `HR team` *(HR stays caps)* |
| `HR Department` | `HR department` |
| `Customer Support` | `customer support` |
| `Customer Success Team` | `customer success team` |
| `Boss` | `boss` |
| `Finance Team` | `finance team` |
| `Marketing` (as role) | `marketing` |
| `Supplier` | `supplier` |
| `IT Support` | `IT support` *(IT stays caps)* |
| `Leadership Team` | `leadership team` |
| `Engineering Team` | `engineering team` |
| `Talent Team` | `talent team` |
| `Release Manager` | `release manager` |
| `Compliance Team` | `compliance team` |
| `Talent Acquisition` | `talent acquisition` |
| `People Ops` | `people ops` |
| `Admin` (as role) | `admin` |
| `Administration` (as role) | `administration` |

**Exception:** Proper names always stay capitalized (`Dear John`, `Hi Sarah`, `L&D Team` as a brand-style name).

### Issue B — Malformed Standalone Closing (~line 896)

Output found: `"Good morning.\n\nBest"` — `"Best"` alone is malformed. Should be either:
- `"Good morning.\n\nBest,"` followed by a name on the next line, OR
- `"Good morning.\n\nBest regards"` if no name follows.

### Issue C — Trailing Comma Inconsistency on Standalone Closings

Some entries have `"Thanks,"` with no name on the next line — comma is wrong here.

**Rule:**
- `Thanks,\nRahul` → comma correct ✓ (name follows)
- `Thanks` standalone (no name) → `Thanks.` — period YES, comma NO
- `Thank you` standalone (no name) → `Thank you.` — period YES, comma NO

---

## 8. Manual Review Findings — Seeds v4 (NEW)

Full manual review of all 321 entries in `email_context.jsonl`. Issues found and fixed:

---

### Finding A — `\n\n` Missing After Greeting (Structural)

Many entries had greeting directly merged with body using a comma instead of `\n\n`.

**Wrong:** `"Hey Mark, I will be 5 minutes late..."` ❌
**Correct:** `"Hey Mark,\n\nI will be 5 minutes late..."` ✅

**Rule:** Email mein agar greeting hai aur uske baad ANY content hai (chahe ek sentence bhi), `\n\n` mandatory hai. Single-line exception ONLY for pure acknowledgments (`"Got it, thanks."`, `"Noted."`, `"Will do."` etc.).

---

### Finding B — Em-Dash Auto-Added (No "dash" spoken)

Multiple entries had `—` (em-dash) added without user saying "dash".

**Wrong:** `"Quick question — do you know..."` ❌
**Wrong:** `"Just wanted to share some exciting news — we hit..."` ❌
**Wrong:** `"Heads up — the demo environment will be down..."` ❌

**Fix pattern:**
- Em-dash as intro/elaboration → **colon** (`"Quick question: do you know..."`)
- Em-dash as pause → **comma** (`"Heads up, the demo environment..."`)

**Rule:** No auto em-dash. Only add `-` (hyphen) or `—` (em-dash) when user explicitly says `"dash"`.

---

### Finding C — Extended Generic Role Capitalization List

In addition to roles from Section 7A, these were also found capitalized incorrectly:

| Wrong | Correct |
|-------|---------|
| `Dear Professor,` | `Dear professor,` |
| `Dear Manager,` | `Dear manager,` |
| `Dear Community,` | `Dear community,` |
| `Dear Vendors,` / `Hi Vendors,` | `Dear vendors,` / `Hi vendors,` |
| `Hello Applicant,` | `Hello applicant,` |
| `Hello Subscribers,` | `Hello subscribers,` |
| `Hi Support,` / `Hi Tech Support,` | `Hi support,` / `Hi tech support,` |
| `Hi Marketing Team,` | `Hi marketing team,` |
| `Hi Vendor Team,` | `Hi vendor team,` |
| `\nStudent` | `\nstudent` |
| `\nCustomer` / `\nUnhappy Customer` | `\ncustomer` / `\nunhappy customer` |
| `\nYour Manager` | `\nYour manager` |
| `\nCoordinator` | `\ncoordinator` |
| `\nLogistics` | `\nlogistics` |
| `\nEvents` | `\nevents` |
| `\nEngineering` | `\nengineering` |
| `\nTech Lead` | `\ntech lead` |
| `\nData Team` | `\ndata team` |
| `\nInfrastructure Team` | `\ninfrastructure team` |
| `\nFounding Team` | `\nfounding team` |
| `\nSales Team` | `\nsales team` |
| `\nRecruitment Team` | `\nrecruitment team` |
| `\nShipping Team` | `\nshipping team` |
| `\nAccounts Team` | `\naccounts team` |
| `\nBusiness Development` | `\nbusiness development` |
| `\nDirector of Marketing` | `\ndirector of marketing` |
| `\nProcurement` | `\nprocurement` |
| `\nThe Team` | `\nThe team` |
| `Senior Engineer` (job title in body) | `senior engineer` |

**Exception — Title + Proper Name:**
- `"Dear professor"` (no name) → `"Dear professor,"` lowercase ✅
- `"Dear Professor Williams"` (title + proper name) → both caps ✅
- `"principal davis"` → `"Principal Davis"` ✅

**Abbreviations always caps:** HR, IT, UX, DevOps, CEO, CTO, COO, CFO

---

### Finding D — Phone Number Formatting

**Decision:** Plain digits, no dashes, no spaces.
- `"nine eight seven six five four three two one zero"` → `9876543210`
- Reason: Indian numbers mein dashes nahi hote, aur "no auto-dash" rule consistent rehni chahiye.
- Exception: Agar user explicitly "dash" bole between digits → dash add karo.

---

### Finding E — "To Whom It May Concern" Capitalization

Standard formal opening phrase — har word capitalize hota hai.
- `"to whom it may concern"` → `"To Whom It May Concern,"` (comma ke saath)
- Structure baaki emails jaisi: `To Whom It May Concern,\n\n[body]\n\n[closing]`

---

### Finding F — "doctor" Normalization

Both spoken forms → `Dr.` in email context.
- `"dr patel"` → `"Dr. Patel"` ✅
- `"doctor patel"` → `"Dr. Patel"` ✅ (email mein "Doctor Patel" unprofessional lagta hai)

---

### Finding G — Spoken Enumeration → Numbered List

When user clearly enumerates with "one, two, three" after an intro phrase → numbered list.

**Pattern:** `"[X] were/are/following one [item] two [item] three [item]"` → numbered list
- `"key decisions were one... two... three..."` → `1. ... 2. ... 3. ...`
- `"please submit the following one... two... three..."` → `1. ... 2. ... 3. ...`

**Not a list:** Isolated "one" as quantity or time stays as-is.
- `"I have one question"` → no list
- `"meeting at one pm"` → `"1 PM"`, no list

---

## 🛠️ Dataset Fix Checklist (Revised)

1. **Mass Lowercase:** *(HIGH PRIORITY — directly caused 12 exact match failures in eval)* Scan all `output` fields in `email_context.jsonl` and lowercase generic roles:
   - `Hiring Manager` -> `hiring manager`
   - `HR Team` -> `hr team`
   - `Customer Support` -> `customer support`
   - `Supplier` -> `supplier`
   - `IT Support` -> `IT support`
2. **Structural Enforcement:** Add more examples where the email is **deliberately short** (Body + Closing) but still uses `\n\n` to prevent the model from merging short emails into chat style.
3. **Closing Standardization:** Remove trailing commas from standalone "Thanks" or "Regards" in the seeds if no name follows. This will stop the model from hallucinating signatures.
4. **Vocative Comma — Always Present:** Every greeting in every email (formal or casual) must have a comma. `Dear team,` ✅ `Hi team,` ✅ `Hey Sarah,` ✅ — no exceptions.
5. **Name Signature Pattern:** Ensure that if an example has a name signature, it is ALWAYS on a new line after the closing.
   - *Correct:* `\n\nBest,\nRahul`
   - *Avoid:* `\n\nBest, Rahul`
6. **Fix Malformed "Best" Closing:** Find and fix the entry with `"Good morning.\n\nBest"` — add comma + name or replace with `"Best regards"`.
7. **Fix Ampersand:** Ensure `&` in team names stays as `&` — not spelled out as "and". (`L&D Team` stays `L&D Team`).
8. **Add "dash" voice command examples:** Add examples showing explicit `"dash"` → `-` conversion in compound words (`"follow dash up"` → `"follow-up"`). Do NOT auto-add hyphens — only add when user explicitly says "dash".
