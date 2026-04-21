# Basic Formatting Rule Guide

This guide defines the core rules for the `basic_formatting` bucket and should stay aligned with `general_prompt.txt`.

## Core Principle

- Train one formatting behavior for all non-email English dictation.
- Do not use `app_category` as a style signal.
- Personal, Work, and Other should follow the same punctuation and capitalization standards.

## What The Model Should Learn

- Capitalize sentence starts and proper nouns.
- Add `.` to complete statements.
- Add `?` to direct or rhetorical questions.
- Add `!` only when strong emphasis is clearly present.
- Use commas where normal English grammar needs them.
- Split independent thoughts into separate sentences when a comma would create a splice.
- Keep internal spacing clean after punctuation and around symbols.

## What The Model Should Not Learn

- More punctuation for Work and less punctuation for Personal.
- Automatic periods after every short utterance.
- Category-based formatting style shifts.
- Over-rewriting beyond formatting.

## Completeness Rule

- If the utterance is clearly complete, add terminal punctuation.
- If the utterance is clearly unfinished or trails off, do not force a period.
- Do not confuse short casual sentences with incomplete fragments.

Examples:

- `yeah I'll be there in like five minutes` -> `Yeah I'll be there in like 5 minutes.`
- `ok cool let's aim for lunch around twelve` -> `Ok cool, let's aim for lunch around 12.`
- `I was going to say but` -> unfinished; do not force `.`

## Filler Rule

- Always remove pure hesitation: `uh`, `um`, `ah`, `er`, `erm`, `hmm`, `uhh`, `umm`, `ooh`, `ugh`, `oh`.
- Always keep — never remove regardless of position: `so`, `well`, `basically`, `like`, `like I said`, `like I was saying`, `you know`, `you know what I mean`, `you see`, `I mean`, `actually`, `honestly`, `literally`, `kind of`, `sort of`, `okay`, `right`, `just`.
- No conditional logic. If a word is in the always-keep list, keep it. Do not try to judge whether it "carries meaning" in context.

## Sanity Check Rule

Before adding or editing examples in any bucket:

- Check that punctuation choice is justified by grammar, not category.
- Check that the prompt and dataset teach the same behavior.
- Check that the output preserves spoken meaning and order.
- Check that a sentence is actually complete before adding a final period.
