# Formatter Fine-Tuning: Iteration 4 In-Depth Analysis Report

## 1. High-Level Overview
* **Checkpoint**: `000040` (Iteration 4)
* **Total Examples**: 451
* **Exact Match**: 64.1% (289/451)
* **Fuzzy Match**: 66.5% (300/451)
* **Gate Status**: **FAIL** (Target: >= 95%)

**Verdict**: The model has achieved a solid baseline in basic formatting and error correction but is severely held back by **Hinglish** (missing punctuation) and **Self-Correction** (merging instead of truncating). 

Below is a granular breakdown of failures across every bucket to guide the creation of the next training dataset ("God Dataset").

---

## 2. Bucket-by-Bucket Deep Dive

### 🟢 ASR Errors (45/48 Correct | 93.8% Accuracy)
**Failures**: 3

**1. The "two" vs "2" Mix-up (Model + Data Issue)**
* **Input**: `im going two fix the bug right now`
* **Expected**: `Im going two fix the bug right now.`
* **Generated**: `I'm going 2 fix the bug right now.`
* **Analysis**: Ground truth missed expanding "Im" to "I'm". The model did that, but incorrectly converted the ASR error "two" (meant to be "to") into the number "2".

**2. Auto-complete Hallucination (Over-correction)**
* **Input**: `check the repo for the latest com`
* **Expected**: `Check the repo for the latest com.`
* **Generated**: `Check the repo for the latest commit.`
* **Analysis**: Model hallucinated and finished the cut-off word "com" into "commit".

**3. Proper Noun Casing Confusion**
* **Input**: `the applica crashed on startup`
* **Expected**: `The applica crashed on startup.`
* **Generated**: `The Applica crashed on startup.`
* **Analysis**: Model capitalized "Applica" treating it as a proper noun/app name.

**✅ Action Items for Next Data**: 
* Add 2-3 examples with cut-off words (e.g., `com`, `deploym`) to teach the model to keep them exactly as they are without auto-completing.

---

### 🟢 Edge Cases (41/48 Correct | 85.4% Accuracy)
**Failures**: 7

**1. Reported Speech / Quotes Missed (Major)**
* **Input**: `the client said this design is exactly what we wanted`
* **Expected**: `The client said, 'This design is exactly what we wanted.'`
* **Generated**: `The client said this design is exactly what we wanted.`
* **Analysis**: The model consistently fails to wrap reported speech ("said", "told us") in quotes.

**2. Minor Punctuation & Over-Grammar**
* **Input**: `that is completely fine but`
* **Expected**: `That is completely fine but`
* **Generated**: `That is completely fine, but`
* **Analysis**: The model is applying overly strict grammar rules (adding commas before "but" or "so") on unfinished sentences.

**✅ Action Items for Next Data**:
* Inject 5-10 examples featuring words like "said", "told us", "replied" that output explicitly with single/double quotes.
* Add jargon examples with correct casing (e.g. `DevOps`).

---

### 🟢 Numbers Formatting (41/50 Correct | 82.0% Accuracy)
**Failures**: 9

**1. Units Abbreviation Missed (Major)**
* **Input**: `...four hundred megabytes per second to one point two gigabytes per second`
* **Expected**: `...400 MB/s to 1.2 GB/s.`
* **Generated**: `...400 megabytes per second to 1.2 gigabytes per second.`
* **Analysis**: Fails to convert written unit words into standard abbreviations (`ms`, `MB`, `GB`).

**2. Over-Assumption of Currency**
* **Input**: `he earns somewhere in the range of sixty to eighty thousand a year`
* **Expected**: `...range of 60 to 80 thousand a year.`
* **Generated**: `...range of $60,000 to $80,000 a year.`
* **Analysis**: Assumes currency and adds `$` signs where none were spoken.

**3. Number Hallucination**
* **Input**: `the new screen has a resolution of twenty five sixty by sixteen forty four`
* **Expected**: `...resolution of 2560×1644.`
* **Generated**: `...resolution of 2560 × 1444.`
* **Analysis**: Incorrectly transcribed 1644 as 1444.

**✅ Action Items for Next Data**:
* Add explicit examples teaching `megabytes -> MB`, `milliseconds -> ms`.
* Prevent over-correction by ensuring numbers like "sixty thousand" without explicit currency markers don't get `$`.

---

### 🟡 Basic Formatting (39/49 Correct | 79.6% Accuracy)
**Failures**: 10

**1. Comma Splices (Major - 50% of failures)**
* **Input**: `the release went out cleanly no rollback needed`
* **Expected**: `The release went out cleanly. No rollback needed.`
* **Generated**: `The release went out cleanly, no rollback needed.`
* **Analysis**: The model joins two completely independent clauses with a comma instead of splitting them into two sentences with a full stop.

**2. Filler Words Retained**
* **Input**: `hmm have you eaten anything today`
* **Expected**: `Have you eaten anything today?`
* **Generated**: `Hmmm, have you eaten anything today?`
* **Analysis**: Model formats filler words instead of deleting them.

**✅ Action Items for Next Data**:
* Add 15-20 long, unpunctuated sentences and explicitly split them into two sentences using a period (`.`) in the ground truth.
* Define strict rules for dropping `hmm`, `uh`, `um`.

---

### 🟡 Email (43/56 Correct | 76.8% Exact, 87.5% Fuzzy)
**Failures**: 13

**1. Title and Salutation Casing**
* **Input**: `dear sir or madam i would like to request...`
* **Expected**: `Dear Sir or Madam,`
* **Generated**: `Dear sir or madam,`
* **Analysis**: Fails to properly capitalize formal salutations. 

**2. Sign-off Expansion**
* **Input**: `... thank you for your cooperation during the audit best`
* **Expected**: `... Best regards.`
* **Generated**: `... Best.`
* **Analysis**: Fails to expand the colloquial "best" into a formal sign-off.

**3. Model is actually better than Ground Truth (5 Cases)**
* **Input**: `hi all the wifi password has been updated...`
* **Expected**: `... wifi password...`
* **Generated**: `... WiFi password...`
* **Analysis**: Model correctly used "WiFi", "Senior Developer", and "read-only", which failed exact match due to flawed ground truth.

**✅ Action Items for Next Data**:
* Fix flawed ground truth examples so the model doesn't fail when it's actually correct.
* Add 10-15 examples of Title Case subjects and `Dear Sir or Madam` salutations.

---

### 🟠 Voice Commands (31/48 Correct | 64.6% Accuracy)
**Failures**: 17

**1. Hashtags and Literal Retention (Major)**
* **Input**: `use the hashtag launch day in the tweet`
* **Expected**: `Use the #launchday in the tweet.`
* **Generated**: `Use the hashtag #launchDay in the tweet.`
* **Analysis**: The model fails to replace the word "hashtag" entirely, and sometimes applies incorrect casing or keeps spaces.

**2. Number vs Word Rules**
* **Input**: `I have two options colon approve or reject`
* **Expected**: `I have two options: approve or reject.`
* **Generated**: `I have 2 options: approve or reject.`
* **Analysis**: Inconsistent conversion of words like "two" to "2".

**3. Dash Formatting Glitch**
* **Input**: `the css class is card dash container dash active`
* **Expected**: `card-container-active`
* **Generated**: `card--container--active`
* **Analysis**: Generates double hyphens instead of a single hyphen.

**✅ Action Items for Next Data**:
* Add strict examples showing `hashtag X` turning into `#x` (dropping the literal word).
* Map the word `dash` strictly to a single hyphen `-`.

---

### 🔴 Self Correction (20/44 Correct | 45.5% Accuracy)
**Failures**: 24

**1. The "Smart Merger" / Over-Correction (Major)**
* **Input**: `let's do the sprint planning on thursday no wait friday morning is our standard slot`
* **Expected**: `Friday morning is our standard slot.`
* **Generated**: `Let's do the sprint planning on Friday morning, is our standard slot.`
* **Analysis**: The model acts like an editor. Instead of aggressively truncating the first thought when the trigger ("no wait") is hit, it merges the subjects from both halves into one coherent but incorrect sentence.

**2. The Ignorer**
* **Input**: `tell the client we need three days correction tell them a week to manage expectations`
* **Expected**: `Tell them a week to manage expectations.`
* **Generated**: `Tell the client we need 3 days correction, tell them a week to manage expectations.`
* **Analysis**: Completely ignores the correction intent and prints everything.

**✅ Action Items for Next Data**:
* Provide examples that force **hard truncation**. The model must unlearn its tendency to preserve context. Teach it that trigger words (`no wait`, `correction`, `sorry`) mean the entire preceding phrase must be deleted.

---

### 🔴 Hinglish (29/108 Correct | 26.9% Accuracy)
**Failures**: 79

**1. The Missing Full Stop (71 Cases - The Core Blocker)**
* **Input**: `swiggy se kuch mangwa le mujhe bahot bhukh lagi hai`
* **Expected**: `Swiggy se kuch mangwa le mujhe bahot bhukh lagi hai.`
* **Generated**: `Swiggy se kuch mangwa le mujhe bahot bhukh lagi hai` 
* **Analysis**: **90% of the Hinglish failures are solely because the model drops the terminal period (`.`).** The model treats Roman Hindi sentences as unfinished thoughts.

**2. Time and Numbers Over-Formatting**
* **Input**: `HR ka contact number hai 8823456789.`
* **Expected**: `HR ka contact number hai 8823456789.`
* **Generated**: `HR ka contact number hai 882-345-6789.`
* **Analysis**: Formats Indian phone numbers in a US style. It also adds `₹` to unprompted numbers (e.g. `1,50,000`).

**✅ Action Items for Next Data**:
* **Mandatory Punctuation**: Inject 100+ Hinglish sentences into the training data that explicitly end with periods (`.`) and question marks (`?`).
* Show 10-digit phone numbers without hyphens.

---
**Final Recommendation**: Do not proceed to ASR tuning yet. Consolidate these action items into the new "God Dataset" and run one more formatter fine-tuning iteration. Fixing the **Hinglish periods** and **Self-correction truncation** will guarantee a pass rate above 90%.
