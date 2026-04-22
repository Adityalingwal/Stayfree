# Global Rule Guide

This guide is the shared reference for bucket-level cleanup. It currently covers `Basic Formatting`, `Numbers Formatting`, `Self Correction`, `ASR Errors`, `Voice Commands`, and `Edge Cases`.

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
- This guide is for complete-utterance formatting, numeric normalization, and explicit self-correction, not broad semantic rewriting.

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

## Self Correction

- This bucket teaches explicit correction when the speaker clearly pivots away from the first version.
- Keep only clear, low-ambiguity pivots such as `no wait`, `wait no`, `actually`, `sorry`, and `correction`.
- Preserve the final corrected intent and drop the first attempt.
- Keep the rewrite minimal; do not turn the correction into a full paraphrase.
- Remove or simplify ambiguous cases where the model would need to guess subject carry-over, pronoun swaps, or hidden reasoning.
- Keep simple value swaps, name swaps, place swaps, time swaps, and direct action swaps.
- Do not include `rather`, `let me rephrase`, `I mean`, `scratch that` or `not that` as core training signals here.
- Fix clear stutters (both single-word and phrase stutters) by keeping only the final fluency.
- Do not use self-correction examples to teach general punctuation or app-style differences.
- If the final intent is still clear after the pivot, keep that final intent and format it cleanly.

## ASR Errors

- This bucket teaches the model to preserve the text exactly as provided by the ASR, even when it contains mishearings, garbled text, or cut words.
- Do NOT correct misheard words or homophones. If the ASR outputs "male" instead of "mail", keep "male".
- Do NOT rewrite garbled text to make it make sense. Apply standard capitalization and punctuation to the garbled text as-is.
- Remove non-verbal ASR hallucination markers such as `♪` or `[BLANK_AUDIO]`.
- If the entire input consists of hallucination markers or pure filler, return an empty string.
- Do NOT remove English phrases (like "thank you for watching"); treat them as spoken words.
- Keep partial cut words exactly as they are. Do NOT add a trailing dash or try to guess the complete word.
- Do not let the model ignore number formatting rules just because the sentence contains an ASR error. Numbers should still be formatted properly.

## Voice Commands

- This bucket teaches the model to translate spoken dictation commands into layout, punctuation, brackets, and symbols.
- Spoken commands should be replaced with their literal characters (e.g., `period` -> `.`, `new line` -> `\n`, `at sign` -> `@`).
- Do NOT replace command words when they are clearly natural speech (e.g., `period of time`, `what's the question mark for`).
- Pass through system-level commands unchanged: `select all`, `caps on`, `caps off`, `all caps`. Do NOT execute or modify them.
- Standard Basic Formatting rules (capitalization, grammar) apply across layout commands like `\n`. If a `new line` creates a sentence boundary, the next word is capitalized; if it splits a sentence after a comma, it remains lowercase.

## Edge Cases

- This bucket handles complex boundary issues, intentional repetition, expressive content, and ambiguous formatting logic.
- Remove pure fillers like `ugh`, `umm`, `hmm` without altering the surrounding sentence.
- Keep expressive content and meaningful discourse markers like `wow`, `haha`, `so`, `well`, `like`.
- Preserve intentional repetition used for emphasis, separating the words with commas (e.g., `no no no` -> `No, no, no`). Do NOT confuse this with accidental stuttering (which should be removed).
- Do not expand acronyms (e.g., ASAP, FYI) and do not contract spoken phrases into acronyms.
- Preserve all-caps emphasis exactly if the ASR captured it.
- Preserve contractions exactly as spoken. Do NOT expand `don't` to `do not` or vice-versa.
- When handling ambiguous sentence boundaries joined by conjunctions (and, but, so), treat them as separate sentences if each clause has its own subject and verb.

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

## Self Correction Details

- `meet at three no wait four` -> `Meet at 4.`
- `assign to mike no sorry david` -> `Assign to David.`
- `the deadline is friday actually no monday` -> `The deadline is Monday.`
- `change the color to blue no actually make it red` -> `Make it red.`
- `send it to legal wait actually HR` -> `Send it to HR.`
- `the the meeting is starting` -> `The meeting is starting.` (Single word stutter)
- `we need need five copies` -> `We need 5 copies.` (Single word stutter)
- `we should we should go now` -> `We should go now.` (Phrase stutter)
- `can we can we push the release` -> `Can we push the release?` (Phrase stutter)

## ASR Errors Details

- `we need to synergy the bottleneck` -> `We need to synergy the bottleneck.` (Garbled text)
- `send the male to the client` -> `Send the male to the client.` (Misheard word)
- `i'm going to the sto` -> `I'm going to the sto` (Cut word without dash)
- `[BLANK_AUDIO]` -> `""` (Hallucination removed)
- `the ♪ meeting is starting` -> `The meeting is starting.` (Mixed hallucination removed)
- `its important that your on the call at nine am` -> `Its important that your on the call at 9 AM.` (Misheard word kept, but time rule applies)


## Voice Commands Details

- `new line` -> `\n`
- `period` / `full stop` / `dot` -> `.`
- `dash` / `hyphen` / `em dash` -> `—`
- `ellipsis` / `dot dot dot` -> `...`
- `open parenthesis` -> `(`
- `the score is five dash three` -> `The score is 5—3.`
- `select all and copy` -> `select all and copy` (Pass through unchanged)
- `what's the question mark for` -> `What's the question mark for?` (Context awareness)
- `roses are red comma new line violets are blue` -> `Roses are red,\nviolets are blue` (Newline after comma does NOT capitalize next word)

## Edge Cases Details

- `no no no we can't` -> `No, no, no, we can't.` (Intentional emphasis)
- `the the meeting` -> `The meeting.` (Accidental stutter, handled by Self Correction logic)
- `ugh this is terrible` -> `This is terrible.` (Pure filler removed)
- `wow that is amazing` -> `Wow, that is amazing.` (Expressive kept)
- `ASAP` -> `ASAP` (Kept as acronym)

## Sanity Check

- Check that the main transformation is the one the bucket is supposed to teach.
- Check that currency symbols appear only when explicitly licensed by the spoken denomination.
- Check that the output still follows the global formatting rules.
- Check that the example is not secretly a self-correction example.
- Check that self-correction examples are explicit and low-ambiguity, not broad rewrite cases.
- Check that ASR errors do not inadvertently teach the model to ignore number formatting.
- Check that no dashes are added to cut words in the ASR bucket.
