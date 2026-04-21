# Global Rule Guide

This guide is the shared reference for bucket-level cleanup. It currently covers only `Basic Formatting` and `Numbers Formatting`.

## Global Rules

- Train one formatting behavior for all non-email English dictation.
- Do not use `app_category` as a style signal.
- Personal, Work, and Other should follow the same English punctuation and capitalization standards.
- Preserve the speaker's wording, intent, and tone.
- Never add words not spoken.
- Never remove meaningful words.
- Never translate.
- Never reorder content.
- Capitalize sentence starts and proper nouns.
- Add `.` to complete statements.
- Add `?` to direct or rhetorical questions.
- Add `!` only when strong emphasis is clearly present.
- Use commas where normal English grammar needs them.
- Split independent thoughts into separate sentences when a comma would create a splice.
- Keep internal spacing clean after punctuation and around symbols.
- Remove pure hesitation only when it is clearly filler.
- If unsure whether a word is filler, prefer keeping it.
- If the utterance is clearly complete, add terminal punctuation.
- If the utterance is clearly unfinished, do not force a period.
- Do not confuse short casual sentences with incomplete fragments.
- This guide is for complete-utterance formatting and numeric normalization, not self-correction.

## Basic Formatting

- This bucket teaches clean sentence formatting for non-email English dictation.
- The main signal is grammar, punctuation, and sentence boundaries, not app style.
- `Personal`, `Work`, and `Other` should all follow the same formatting rules here.
- Complete statements should get normal terminal punctuation.
- Questions should get `?`.
- Comma splices should be split when the thoughts are independent.
- Sentence starts and proper nouns should be capitalized.
- Keep filler policy consistent with the global rules.
- Keep meaningful discourse markers and softeners when they carry intent.
- This bucket mostly teaches complete-utterance formatting and sentence splitting; unfinished fragments are edge cases, not the main signal.
- Do not make `Work` more punctuated and `Personal` less punctuated.
- Do not force a period on short utterances just because they are short.
- Do not use this bucket to teach self-correction behavior.

## Numbers Formatting

- This bucket teaches number normalization, not self-correction and not app-based style differences.
- Basic formatting rules still apply here: sentence capitalization, punctuation, and sentence boundaries should remain clean and consistent.
- Spoken numbers should become digits when natural.
- Times should be normalized: `three thirty pm` -> `3:30 PM`.
- Dates and ordinals should be normalized: `march fifteenth` -> `March 15th`.
- Percentages should become digits with `%`.
- Phone numbers, ports, IPs, versions, resolutions, scores, and measurements should be normalized.
- Currency formatting only applies when the denomination is explicitly spoken.
- Use `$` only when the speaker says `dollars` or `cents`.
- Use `₹` when the speaker says `rupees`.
- Keep `bucks`, `grand`, `lakh`, and `crore` as spoken without adding `$` or `₹`.
- If no denomination is spoken, keep digits but do not add a currency symbol.
- Do not add `$` to bare numeric amounts just because they sound like money.
- Do not add `₹` to `lakh` or `crore` unless `rupees` is also spoken.
- Do not include self-correction examples in this bucket.
- Do not include general punctuation-only examples with no numeric transformation.
- Do not use app-context style differences here.

## Basic Formatting Details

- Capitalize `Tuesday`, `Thursday`, `Q3`, `Node`, `Safari`, `Figma`, `YAML`, `API`, `PR`, and `ASAP`.
- Remove pure hesitation words such as `uh`, `um`, `er`, `erm`, and `hmm`.
- Keep meaningful discourse markers such as `so`, `well`, `basically`, `like`, `you know`, `you see`, `I mean`, `actually`, `honestly`, `literally`, `kind of`, `sort of`, `okay`, `right`, and `just`.
- Preserve natural conversational flow with clean sentence segmentation.
- Do not add missing words just to make a sentence sound more complete.
- Do not force ellipsis for trailing fragments.
- Keep quoted speech, lists, and proper nouns consistent with standard English formatting.

## Numbers Formatting Details

- `ten` -> `10`
- `fifty` -> `50`
- `three thirty pm` -> `3:30 PM`
- `quarter past five` -> `5:15`
- `march fifteenth` -> `March 15th`
- `thirty percent` -> `30%`
- `five hundred dollars` -> `$500`
- `twenty five dollars and fifty cents` -> `$25.50`
- `five hundred bucks` -> `500 bucks`
- `ten grand` -> `10 grand`
- `rent is fifteen hundred a month` -> `Rent is 1,500 a month.`
- `the property costs one point five crore` -> `The property costs 1.5 crore.`
- `the API response time is two hundred and thirty milliseconds` -> `The API response time is 230 milliseconds.`
- `the file size is about forty seven point three megabytes` -> `The file size is about 47.3 megabytes.`
- `five hundred rupees` -> `₹500`
- `two lakh rupees` -> `₹2,00,000`

## Sanity Check

- Check that the main transformation is the one the bucket is supposed to teach.
- Check that currency symbols appear only when explicitly licensed by the spoken denomination.
- Check that the output still follows the global formatting rules.
- Check that the example is not secretly a self-correction example.
