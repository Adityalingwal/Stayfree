# Hinglish JSONL — Review & Verification Spec

## Purpose
This document is a reference spec for reviewing or re-verifying training examples in `hinglish.jsonl`. Any agent reviewing this file should apply all rules below to every `"output"` field.

---

## What Is This Data?
Each JSONL entry is a voice dictation formatting example:
```json
{"input": "raw speech-to-text", "output": "formatted clean text", "app_category": "Personal|Work|Other"}
```
The formatter converts raw speech into clean text for messaging apps, notes, and work tools. Hinglish is a **casual WhatsApp/texting style** — not formal written English.

---

## Core Formatting Rules

### Capitalization
- Capitalize the first word of every sentence.
- Capitalize proper nouns: names, places, brands, days, months, tech tools (Sass, Node, Figma, Docker, etc.).
- English technical terms stay as-is: API, PR, CI/CD, npm, git, etc.

### Filler Removal
- **Remove**: uh, um, ah, er, erm, hmm, uhh, umm
- **Keep always**: so, well, basically, like, you know, I mean, actually, honestly, literally, kind of, sort of, okay, right, just, waise, matlab, yani ki, toh, yaar

### Numbers & Formats
- Spoken numbers → digits: "teen" → `3`, "dus hazaar" → `10,000`
- Times: "teen baje" → `3 PM`, "saadhe teen" → `3:30`
- Dates: "march fifteenth" → `March 15th`
- Percentages: "tees percent" → `30%`

### Currency — STRICT RULE
- Use `₹` **only** when speaker explicitly says **"rupees"** or **"rupaye"**
- "hazaar", "lakh", "crore", "sau", "grand", "bucks" alone → **NO symbol**, just digits
- Examples:
  - `"paanch sau rupaye"` → `"₹500"`
  - `"paanch sau"` → `"500"` (no ₹)
  - `"do lakh rupaye"` → `"₹2,00,000"`
  - `"do lakh"` → `"2 lakh"` (no ₹)

---

## Hinglish Punctuation Model

Hinglish outputs follow a **minimal punctuation** style — casual, flowing, like WhatsApp messages.

### Full Stop (.)
- Add at the end of a **clearly complete** sentence.
- Do **not** add if the sentence is trailing off or incomplete.

### Question Mark (?)
- **Always** add for questions — direct or rhetorical.

### Exclamation (!)
- Only when strong emphasis is **clearly** present.

### Commas — MINIMAL
- Almost no commas in flowing Hinglish speech.
- Use a comma only for: explicit lists (3+ items), or an unusually strong natural pause.
- **Do NOT add commas** in:
  - Flowing connected clauses: `"kaam ho gaya toh nikal jaate hain"` (no comma before "toh")
  - Casual connectors: `"hai toh"`, `"karo phir"`, `"dekho na"`

### No Vocative Commas
Never add a comma after address words at the start of a sentence:
- `"Yaar, ..."` → `"Yaar ..."`
- `"Bhai, ..."` → `"Bhai ..."`
- `"Arre, ..."` → `"Arre ..."`
- `"Suno na, ..."` → `"Suno na ..."`
- `"Acha, ..."` → `"Acha ..."`
- `"Dekh, ..."` → `"Dekh ..."`
- `"Chal, ..."` → `"Chal ..."`
- `"Waise, ..."` → `"Waise ..."`

### No Em-Dashes
Do not use `—` in casual Hinglish flow. Remove or rewrite as a simple list/colon.

---

## Intentional Repetition — PRESERVE
Do **not** remove repeated words used for emphasis. These are intentional:

| Keep as-is |
|------------|
| `"haan haan"` |
| `"na na"` |
| `"nahi nahi"` |
| `"suno suno"` |
| `"jaldi jaldi"` |
| `"bilkul bilkul"` |
| `"no no no"` |
| `"wait wait"` |

Only remove stutters: `"the the meeting"` → `"the meeting"`, `"I I think"` → `"I think"`.

---

## Known Issues Found & Fixed (Reference)

These are classes of errors that were corrected in the file. Look for any remaining instances.

### Issue 1 — ₹ added without "rupees" spoken
Any output that has `₹` when the input only says "hazaar / lakh / crore / sau" (no "rupees") is wrong.

```
WRONG: "Budget ₹2,000 ke andar rakho."   ← input: "do hazaar", no "rupees"
RIGHT: "Budget 2,000 ke andar rakho."
```

### Issue 2 — Intentional repetition removed
If input has "haan haan", "na na", "nahi nahi", "suno suno" etc., the output must preserve them.

```
WRONG: "Na, mujhe nahi chahiye."         ← input: "na na mujhe nahi chahiye"
RIGHT: "Na na mujhe nahi chahiye."
```

### Issue 3 — Proper noun not capitalized
Tech tool names must be capitalized: Sass, Node, React, Docker, Figma, etc.

```
WRONG: "sass variables use karo"
RIGHT: "Sass variables use karo"
```

### Issue 4 — Over-punctuation
Vocative commas and mid-sentence commas in flowing speech must be removed.

```
WRONG: "Yaar, kal meeting hai kya 3 baje?"
RIGHT: "Yaar kal meeting hai kya 3 baje?"

WRONG: "Bhai, party kab hai, Saturday ko ya Sunday ko?"
RIGHT: "Bhai party kab hai Saturday ko ya Sunday ko?"

WRONG: "Ab feature freeze ho gayi hai, sirf bug fixes acceptable hain."
RIGHT: "Ab feature freeze ho gayi hai sirf bug fixes acceptable hain."

WRONG: "Suno na, kaam kar lo, baad mein ghumna"
RIGHT: "Suno na kaam kar lo baad mein ghumna"
```

### Issue 5 — Valid connectors/discourse markers removed
Words like "yani ki", "toh", "yaar", "matlab", "basically" are NOT filler words. The LLM sometimes incorrectly removes them from the beginning or middle of the sentence.

```
WRONG: "Sab approvals aa gayi hain project start kar sakte hain."   ← input: "yani ki sab approvals aa gayi hain..."
RIGHT: "Yani ki sab approvals aa gayi hain project start kar sakte hain."

WRONG: "Final testing ho gayi hai sab clear release karo."          ← input: "toh yani ki final testing ho gayi hai..."
RIGHT: "Toh yani ki final testing ho gayi hai sab clear release karo."
```

---

## What to NOT Change
- Number formatting (spoken words → digits) — already correct
- Filler removal (uh/um/er already removed) — already correct
- Discourse markers (basically, waise, matlab, toh, yani ki, yaar) — keep as-is
- ₹ examples where "rupees"/"rupaye" IS spoken — keep as-is
- Translations — never translate Hinglish to pure English or vice versa
- Word order — never reorder content

---

## File Location
`formatter-fine-tuning/data/seeds_v4/hinglish.jsonl`
