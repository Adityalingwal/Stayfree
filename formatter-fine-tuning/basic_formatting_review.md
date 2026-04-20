# Basic Formatting Review

Yeh note `basic_formatting` bucket ke liye canonical policy define karta hai before dataset cleanup.

## Current Product Decisions

- `style` field remove karna hai.
- `app_name` ko formatting signal ke taur par use nahi karna hai.
- Non-email flows ke liye ek `general_prompt` use hoga.
- Email ke liye separate `email_prompt` use hoga.
- Basic formatting bucket ko clean English formatting behavior sikhana hai; Hinglish examples is bucket mein nahi rehne chahiye.

## Canonical Rules For Basic Formatting

### 1. Scope

- Basic formatting bucket ka target: raw English dictation ko clean English sentence output mein convert karna.
- Hinglish / Hindi-mixed examples ko is bucket se hatao aur unki dedicated bucket mein rakho.
- App-specific style differences is bucket mein encode mat karo.

### 2. Capitalization

- Sentence start capitalize karo.
- Proper nouns capitalize karo: `Tuesday`, `Thursday`, `Q3`, `Node`, `Safari`, `Figma`, `YAML`, `API`, `PR`, `ASAP`.
- Har clause ka pehla word capitalize mat karo. Pehle sentence boundaries decide karo, phir capitalization apply karo.

### 3. Terminal Punctuation

- Complete statement -> `.`  
- Question -> `?`
- Clear exclamation only when tone strongly supports it -> `!`
- Incomplete / trailing thought -> no forced period, unless ellipsis intentionally needed.
- Same input ko sirf category ke basis par period vs no-period mat do.

### 4. Comma vs Period

- Opener ke baad comma: `Well,`, `Basically,`, `By the way,`, `Honestly,`, `Wait,`, `Man,`, `Wow,`.
- Do independent thoughts hon aur natural break strong ho -> period.
- Comma splice avoid karo:
  - `The API rate limit was hit twice today, we need to optimize our requests.` -> better as `The API rate limit was hit twice today. We need to optimize our requests.`
  - `The team has been doing really well this quarter, proud of the progress` -> better as `The team has been doing really well this quarter. Proud of the progress.`
- Short continuation ya add-on ho toh comma theek hai:
  - `I'm running like 10 minutes late, save me a seat.`

### 5. Filler Removal Policy

- Always remove pure hesitation: `um`, `uh`, `er`, `erm`, `hmm`.
- Remove duplicated stutter tokens: `the the`, `we we`, `I I`.
- Keep meaningful discourse markers:
  - `basically` when it summarizes.
  - `well` when it signals a considered answer.
  - `the thing is` when it introduces explanation.
  - `just wanted to`, `just a heads up`, `by the way`.
- `so basically`:
  - If `so` is pure stall and `basically` still carries meaning -> `Basically, ...`
  - If whole lead-in is empty stall -> drop the whole lead-in.
- `I mean`:
  - Keep when clarifying or softening: `I mean, that's fair, but...`
  - Remove only when it is a pure restart / repair token.

### 6. "Like" Policy

- `like` ko globally filler treat mat karo.
- Keep when it means approximation, comparison, or natural quoted tone:
  - `like 10 minutes`
  - `it was like a dream`
  - `I feel like we're overthinking this`
- Remove only when clearly meaningless speech clutter. Agar doubt ho, keep.

### 7. Number Normalization

- Spoken cardinals -> digits when natural:
  - `ten minutes` -> `10 minutes`
  - `three days` -> `3 days`
  - `twenty two percent` -> `22%`
  - `four thirty` -> `4:30`
- Idiomatic count words ko over-normalize mat karo:
  - `twice` -> `twice`
- `P one` -> `P1`
- `Q two` -> `Q2`

### 8. Contractions / Light Grammar Repair

- Obvious apostrophe repairs allowed:
  - `its been` -> `It's been`
  - `didnt` -> `didn't`
  - `wasnt` -> `wasn't`
- Par missing words add mat karo.

## High-Confidence Problems In Existing Seeds

### A. Old Style Leakage

`seeds_v2` aur `seeds_v3` mein bahut saare complete Work statements period ke bina khatam ho rahe hain. Yeh old formal-vs-casual style policy ka leftover lagta hai, formatting rule nahi.

Examples:

- `Basically the server went down due to high traffic`
- `We need to review the Q3 metrics before Thursday`
- `I was thinking maybe we should try a completely different approach here`
- `We merged the feature but now the test suite is failing on the main branch`

### B. Hinglish Contamination In Basic Formatting

Is bucket mein yeh row nahi rehni chahiye:

- `Yaar, kal traffic bahut tha, office late pahuncha`

Yeh Hinglish bucket mein move honi chahiye.

### C. Over-Aggressive Removal Of Meaningful Markers

These outputs remove content that still carries speaker intent:

- `I mean we could try the other approach if this one doesn't work out`  
  current -> `We could try the other approach if this one doesn't work out.`  
  preferred -> `I mean, we could try the other approach if this one doesn't work out.`

- `I mean that's fair but we also need to think about scalability`  
  current -> `That's fair, but we also need to think about scalability.`  
  preferred -> `I mean, that's fair, but we also need to think about scalability.`

- `the thing is the API rate limits are blocking our tests`  
  current output keeps phrase but misses helpful comma -> `The thing is, the API rate limits are blocking our tests.`

### D. Missing Commas After Openers

Examples that should be normalized:

- `Basically the server went down due to high traffic` -> `Basically, the server went down due to high traffic.`
- `Well I guess we could push the launch to next Monday` -> `Well, I guess we could push the launch to next Monday.`
- `Just a heads up that network maintenance is happening tonight from 10 PM to midnight.` -> `Just a heads up, network maintenance is happening tonight from 10 PM to midnight.`

### E. Comma Splices / Weak Sentence Segmentation

Examples:

- `The API rate limit was hit twice today, we need to optimize our requests.`  
  better -> `The API rate limit was hit twice today. We need to optimize our requests.`

- `The sprint velocity dropped this cycle, we should look at blockers in the retro`  
  better -> `The sprint velocity dropped this cycle. We should look at blockers in the retro.`

- `We tracked down the root cause of the incident, it was a race condition`  
  better -> `We tracked down the root cause of the incident. It was a race condition.`

- `The beta testers have shared feedback, most of it is positive, a few UX issues`  
  better -> `The beta testers have shared feedback. Most of it is positive, with a few UX issues.`
  Note: last fix may be too rewrite-heavy for basic bucket; if so, drop this example.

### F. Sentence Completeness Issues

Examples that look incomplete or under-punctuated:

- `Just wanted to say great job on the presentation today it was awesome`
- `There's a massive bug in the checkout flow we need to fix it right now`
- `The new onboarding flow has reduced drop off by 22% great results`
- `The feature is about 80% done, needs another 2 days of testing`

These should either be split into full sentences or removed if too ambiguous.

## Recommended Cleanup Strategy

### Keep

- Number normalization
- Proper noun casing
- Question detection
- Deduplication of repeated words
- Natural opener handling
- Meaningful hedges and softeners

### Remove Or Rewrite

- Hinglish rows from this bucket
- Style-driven no-period outputs
- Examples where `I mean` was removed despite being meaningful
- Examples with comma splices
- Examples requiring too much rewriting beyond formatting

## Suggested Canonical Direction For Merged Basic Dataset

- One consistent punctuation policy across v1 + v2 + v3
- No formal vs casual label behavior
- No app-name-specific formatting behavior
- English-only examples in this bucket
- Conservative formatting, not aggressive rewriting
- When in doubt, preserve spoken meaning over "perfect essay English"

## Prompt Alignment Notes

Current prompts broadly strong hain, but a few lines dataset cleanup ke saath align karni hongi:

- `general_prompt.txt`
  - `APP CONTEXT BEHAVIOR` section ab simplified architecture se partially mismatch karti hai if category prompt mein inject nahi ho rahi.
  - `Ambiguous sentence boundaries: if connected by "and"/"but"/"so", treat as one sentence with commas.` yeh line weak hai; isse comma splices learn ho sakte hain.
  - Better rule: `and/but/so` hone se automatically comma mat lagao; meaning aur clause independence dekh ke comma ya period choose karo.

- `email_prompt.txt`
  - Overall direction theek hai.
  - Greeting/sign-off formatting strong aur distinct hai, jo 2-prompt setup ke liye useful hai.
  - Cleanup ke waqt ensure karo ki email training data mein salutation capitalization aur sign-off paragraphing consistent ho.
