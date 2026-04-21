# Self Correction Review

This note captures the current intended behavior for `self_correction` in `seeds_v4`.

## What This Bucket Should Teach

- Explicit spoken correction when the user clearly pivots away from the first attempt.
- Keep the final corrected intent.
- Drop the first attempt when the pivot is unambiguous.
- Keep the rewrite minimal.
- Do not turn self-correction into broad semantic rewriting.

## Current Bucket Policy

- Keep only clear, low-ambiguity pivots.
- Prefer direct replacement over paraphrase.
- Preserve simple stutters only when they are disfluencies.
- Remove examples that need the model to guess hidden intent, pronoun carry-over, or subject bleed.
- Do not use this bucket to teach general punctuation or app-style formatting.

## Keep

These are the patterns that should stay in the bucket.

- Simple value swaps: number, time, date, place, name.
- Direct action swaps: one clear action replaced by another clear action.
- Clear pivot words: `no wait`, `wait no`, `actually`, `sorry`, `I mean`, `correction`, `scratch that`.
- Final intent is explicit and the first attempt can be dropped safely.

Example shapes:

- `we need five no wait ten copies` -> `We need 10 copies.`
- `send it to john actually sarah` -> `Send it to Sarah.`
- `the deadline is friday actually no monday` -> `The deadline is Monday.`
- `use the staging server scratch that use production` -> `Use the production server.`

## Simplify

These patterns are usable, but only if the output stays minimal and faithful.

- Pivot plus short reason: keep the final choice and a short reason if it is spoken directly.
- Pivot plus final intent plus one short trailing clause.
- Stutter + pivot combinations where the corrected clause is obvious.

Guideline:

- Keep the final corrected wording.
- Preserve only the short reason that is directly spoken.
- Do not rewrite the sentence into a new paraphrase.

Example shapes:

- `no actually the new one is ready now` -> `Use the new endpoint, it is ready now.`
- `actually wait for the report first` -> `Wait for the report first.`
- `no wait backup first then run it` -> `Back up first, then run the migration.`

## Remove

These should be pruned from the bucket because they create weak or conflicting signals.

- `rather` as a correction pivot.
- `let me rephrase` as a training signal.
- `not that` as a training signal.
- Heavy semantic rewrites where the model has to infer a new subject or verb.
- Subject bleed from the first attempt into the final answer.
- Pronoun carry-over cases where the model guesses `it/them` versus the original noun.
- Reason-heavy outputs that feel more like paraphrases than corrections.
- Cases where the final output starts behaving like a different bucket, such as general cleanup or opinion rewriting.

Common remove shapes:

- `the budget is fifty thousand rather sixty thousand dollars`
- `i want the blue one not that the red one`
- `email it to the whole team let me rephrase just the engineering team`
- `the bug is in the payment module actually I think it's in the cart service`

## Sanity Check

Before adding a new self-correction example, ask:

- Is the pivot explicit?
- Is the final intent obvious without guessing?
- Can the first attempt be dropped cleanly?
- Does the output stay close to the spoken correction?
- Does this example accidentally teach general cleanup or paraphrase behavior?

If the answer to any of these is no, simplify the example or remove it.

## Practical Summary

- Keep: clear pivot, clear swap, clear final intent.
- Simplify: explicit correction plus a short reason.
- Remove: ambiguous, paraphrased, or inference-heavy rows.

## Handoff Log

What you asked for:

- Review the `self_correction` bucket and align it with the same bucket-cleanup discipline used for `basic_formatting` and `numbers_formatting`.
- Decide which patterns should stay, which should be simplified, and which should be removed.
- Keep the review usable as a reference for Claude Code / Antigravity style sanity checks.
- Keep the guidance in sync with the prompt and the global rule guide.

What has already been done:

- `general_prompt.txt` was narrowed so self-correction only applies on explicit, low-ambiguity pivots.
- `global_rule_guide.md` now has a `Self Correction` section with the shared rules.
- `self_correction.jsonl` was pruned from `269` to `246` examples.
- Ambiguous signals like `rather`, `let me rephrase`, and `not that` were removed as core training patterns.
- Several outputs were simplified so the bucket teaches direct correction instead of broad paraphrase.
- Punctuation was normalized on the retained examples.

Current status for future pass:

- Keep reviewing for any remaining example that feels rewrite-heavy instead of correction-heavy.
- Prefer removing a row over forcing it into the bucket if it needs subject carry-over or hidden inference.
- Use this file as the quick context handoff before doing another sanity pass.
