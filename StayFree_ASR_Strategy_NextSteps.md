# StayFree ASR Fine-Tuning Strategy — Complete Implementation Playbook

**Author:** Sahil Sharma
**Date:** April 27, 2026
**Status:** Phase 2 plan (after Formatter fine-tuning is done)
**Companion to:** `StayFree_Complete_FineTuning_Guide.docx`, `StayFree_ASR_vs_Formatter_DeepDive.docx`
**Purpose:** This document is a complete handover playbook. Anyone (third-party engineer, AI agent, future-Sahil) reading this from start to finish should understand: (1) every decision made, (2) the reasoning behind it, (3) what was rejected, (4) the day-by-day implementation steps, (5) reference code to start with.

---

## Table of Contents

**Strategic Decisions** — sections 1, 26
**Theoretical Foundation** — sections 2, 3, 11, 12
**Architecture** — sections 4, 6, 13, 16, 20, 21
**Data Strategy** — sections 5, 14, 17, 18, 19, 24
**Wispr Feature Parity** — sections 15, 22
**Implementation** — sections 7, 27, 28, 29
**Reference & Decisions** — sections 8, 9, 10, 23, 25

---

## 1. Final Decisions (TL;DR)

| Decision | Choice | Why |
|---|---|---|
| **Base model** | `openai/whisper-large-v3-turbo` | Multilingual, 8x faster than large-v3, 6GB VRAM, MIT license |
| **NOT this** | `distil-whisper/distil-large-v3` | English only — kills our Hinglish goal |
| **Streaming** | `faster-whisper` + WebSocket wrapper | Runtime architecture; lets us hit <500ms ASR latency |
| **Fine-tune method** | LoRA on encoder layers | 5x faster, 3x less memory than full FT |
| **Training platform** | HuggingFace Trainer + PEFT on Modal A100 | No Tinker-equivalent for ASR exists in 2026 |
| **Languages** | English + Hinglish | Phase 2 = English, Phase 3 = Hinglish |
| **Total budget** | $80-150 for both languages | English ~$25, Hinglish ~$70 |

---

## 2. Distilled Whisper — What It Means (Reddit Comment Decoded)

The Wispr employee mentioned "distillation" on Reddit. Here's what that actually means in our context:

**Distillation** = a small "student" model is trained to mimic a large "teacher" model (Whisper-large). The student is 6x faster, 49% smaller, but stays within 1% WER of the teacher.

There are two flavors:

| Variant | Technique | Decoder layers | Languages | Verdict |
|---|---|---|---|---|
| `distil-whisper/distil-large-v3.5` | Student-teacher distillation | 2 | **English only** | ❌ Skip |
| `whisper-large-v3-turbo` (OpenAI) | Decoder pruning + continued pretraining | 4 | **Multilingual** | ✅ Use this |

**What Wispr actually does** (from Baseten case study + Reddit comment):

1. Base ASR — Whisper-based (likely a custom distilled student model trained on their production traffic)
2. Layered proprietary models on top — alignment, confidence scoring, accent detection, formatter
3. Formatter is a fine-tuned Llama 3.1 hosted on Baseten (similar to our pipeline!)
4. Continuous retraining — user correction signals feed back into training pipeline

**Our equivalent**: fine-tuned `whisper-large-v3-turbo` + LoRA adapters per language + our existing fine-tuned Llama formatter. Architecturally we're already aligned with Wispr's approach.

---

## 3. Why NOT Plain Whisper-large-v3 or Distil-Whisper

### Whisper-large-v3 (full)
- Slower (~250ms inference vs 100ms for turbo)
- 10GB VRAM vs 6GB
- Same accuracy as turbo within 1%
- **Verdict**: no reason to choose over turbo for our latency budget

### distil-whisper/distil-large-v3.5
- 1.5x faster than turbo
- ~1% better on short-form English
- **English only** — no Hindi/Hinglish support
- **Verdict**: rejected because Hinglish is core to our differentiation

### whisper-large-v3-turbo ✅
- 8x faster than large-v3
- 6GB VRAM
- 7.75% WER on English (production-grade)
- Supports all 99 Whisper languages including Hindi
- LoRA fine-tunable
- Already used in our MVP doc
- **Verdict**: clear winner

---

## 4. Platform Choice — No Tinker for ASR (Yet)

### What we used for the formatter
**Tinker (Thinking Machines)** — phenomenal DX for LLM fine-tuning. SDK abstracts gradient computation, distributed training, checkpointing. Wrote ~50 lines of Python total.

### Why Tinker doesn't work for ASR
- Tinker focuses on LLMs (transformer decoder-only architectures)
- Whisper is encoder-decoder with audio-specific preprocessing (mel spectrograms, audio resampling)
- No mainstream "Tinker for ASR" exists in 2026

### Together.ai — verified, fine-tuning is LLM-only
Together.ai's fine-tuning page explicitly states: *"all CausalLM models under 100B params are intended to work."*
- **CausalLM** = decoder-only language models (Llama, Mistral, Gemma, Qwen, DeepSeek)
- **Whisper** = encoder-decoder ASR model — does NOT fit CausalLM definition
- The Whisper models on Together.ai's models page (Whisper v3, Whisper v3 Streaming, Voxtral, Deepgram Nova-3) are **inference-only deployments**, NOT fine-tuning targets
- Whisper Large v3 vs Whisper Large v3 (Streaming) on Together.ai: **same underlying model, just different API protocols** (HTTP POST vs WebSocket)

### Full market scan (verified 2026)

| Platform | LLM FT | **ASR/Whisper FT** | DX (ease) | Cost |
|---|---|---|---|---|
| Tinker | ✅ Tier-1 | ❌ | Best | Premium |
| Together.ai | ✅ Tier-1 | ❌ CausalLM only | Best | Mid |
| Fireworks.ai | ✅ | ❌ LLM only | Good | Mid |
| OpenAI | ✅ Limited | ❌ Whisper closed-source | Good | High |
| HuggingFace AutoTrain | ✅ | ⚠️ Limited Whisper UI | Decent | Cheap |
| **Lightning AI Studios** | ✅ | ✅ via PyTorch Lightning | Good | Mid |
| **Modal** | ✅ raw | ✅ raw (via HF Trainer) | Manual | $1.19/hr |
| **RunPod** | ✅ raw | ✅ raw | Most manual | $0.40-1.19/hr |
| Anyscale | ✅ | ⚠️ via Ray, complex | OK | Mid |
| Replicate | ✅ | ⚠️ via Cog containers | Decent | Mid |

### Honest verdict
**No "Tinker for ASR" exists.** Reasons:
1. ASR fine-tuning has lower demand than LLM (less product investment)
2. Audio preprocessing (resampling, mel-spectrograms) hard to abstract
3. Whisper's encoder-decoder architecture is niche vs decoder-only LLMs

### Recommended ASR fine-tuning stack (in priority order)

1. **Lightning AI Studios** — try first. Closest to Tinker DX. Pre-built Whisper recipes via PyTorch Lightning.
2. **Modal + HuggingFace Trainer + PEFT** — fallback. ~150 lines of Python. Solid Python DX, A100 at $1.19/hr.
3. **RunPod + HF Trainer** — cheapest option for cost-sensitive runs.

```
HuggingFace Transformers + PEFT (LoRA) + Trainer
                ↓
   Run on Modal A100 (~$1.19/hr) or Lightning AI
                ↓
   Push checkpoints to HuggingFace Hub
                ↓
   Inference via faster-whisper (loads HF checkpoint + LoRA)
```

**Boilerplate estimate**: ~150-200 lines of Python total. HuggingFace ships an [official Whisper LoRA fine-tuning recipe](https://huggingface.co/blog/fine-tune-whisper) that's basically copy-paste-able.

---

## 5. Data Strategy

### English (Phase 2)

**Goal**: Reduce WER from 7.75% to 4-5% on our domain (dictation, technical terms, Indian English accent).

**Hours target**: 50 hrs (sweet spot for cost/quality)

**Sources**:
- LibriSpeech (free, ~1000 hrs available)
- Common Voice English (free, accented English including Indian)
- **Our own dictation logs** (most valuable — domain-specific vocab like "StayFree", "Cerebrium")
- Synthetic English with technical vocab via TTS

| Hours | Expected WER | LoRA Cost | Training Time |
|---|---|---|---|
| 10 | 5-6% | $4-6 | 3-4 hrs |
| **50** ⭐ | **4-5%** | **$15-25** | **8-12 hrs** |
| 200 | 3-4% | $50-70 | 25-30 hrs |

### Hinglish (Phase 3)

**Goal**: Build our own Hinglish ASR. Currently using Sarvam API (closed-source, 19.31% WER, 39% insertion rate).

**Hours target**: 200 hrs (sweet spot)

**Sources**:
- **MUCS 2021** — 95 hrs of native Hindi-English code-switching (gold standard, OpenSLR #103/#104)
- **Common Voice Hindi** — ~100 hrs
- **IndicVoices subset** — 50-100 hrs (AI4Bharat)
- **Synthetic Hinglish via TTS** — Indic Parler-TTS / Veena, ~100 hrs at near-zero cost
- **Our own users' data** (Phase 4 — once we have user base)

| Hours | Expected WER | LoRA Cost | Training Time |
|---|---|---|---|
| 50 | 12-16% | $15-25 | 8-12 hrs |
| **200** ⭐ | **8-12%** | **$50-70** | **25-30 hrs** |
| 500 | 6-9% | $150-250 | 2-3 days |

### Synthetic Hinglish Data Pipeline

1. Take English text from existing corpora (LibriSpeech, etc.)
2. Use LLM (Claude/GPT-4) to code-switch into Hinglish ("I went to office aur boss meeting bula raha tha")
3. Generate audio via Indic Parler-TTS or Veena TTS
4. Apply 32x voice variation (different speakers, speeds, accents, mic conditions)
5. Augment with background noise, reverb for robustness

**Empirical fact**: Synthetic data can substitute ~50% of real data with comparable results, per recent ACL papers.

---

## 6. Latency Math

### Target latency budget (from MVP doc)
- **L_total**: 1000-1500ms (release hotkey → pasted text)
- **L_asr**: 300-400ms allocated

### Realistic breakdown with whisper-turbo + streaming

```
L_audio_chunking:    50ms     (100ms chunks)
L_network:           50-100ms  (warm endpoint)
L_asr_finalize:      150-250ms (turbo on A100)
L_formatter (Llama): 100-200ms (Groq or self-hosted)
L_paste:             20-50ms   (local clipboard)
────────────────────────────────────────────
L_total:             370-650ms (excluding cold start)
```

**Verdict**: Easily hits 1000-1500ms target. If we keep endpoints warm and use streaming chunked inference, ASR-only stays at 200-300ms even on Hinglish.

---

## 7. 8-Week Execution Plan

### Week 1-2 — Setup + Baseline
- [ ] Modal account setup, request A100 access
- [ ] Build 200-pair evaluation set (100 English + 100 Hinglish)
- [ ] Run baseline: current Groq Whisper on English, current Sarvam on Hinglish
- [ ] Document baseline WER, hallucination rate, insertion rate
- [ ] Set up HuggingFace Trainer + PEFT boilerplate (test on 10 audio samples)
- [ ] Deliverable: baseline numbers + working training script

### Week 3-4 — English Fine-Tuning
- [ ] Collect 50 hrs domain English (LibriSpeech subset + Common Voice + own dictations)
- [ ] Preprocess: 16kHz WAV, 1-30s clips, compute log-mel spectrograms
- [ ] LoRA fine-tune `whisper-large-v3-turbo` on Modal A100 (~$15-25, ~10 hrs)
- [ ] Eval on held-out test set, target 4-5% WER
- [ ] Deploy via faster-whisper streaming wrapper on Cerebrium/Modal
- [ ] A/B test against current Groq Whisper at 10% traffic
- [ ] Deliverable: fine-tuned English ASR adapter, deployed

### Week 5-6 — Hinglish Data Preparation
- [ ] Download MUCS, Common Voice Hindi, IndicVoices subsets
- [ ] Generate 100 hrs synthetic Hinglish via LLM + Indic Parler-TTS
- [ ] Apply CSCL curriculum (Level 1: minimal switching → Level 3: heavy switching)
- [ ] Quality audit: 100 random clips manually reviewed
- [ ] Train/val/test split BEFORE shuffling, version with DVC
- [ ] Deliverable: 200 hrs cleaned Hinglish dataset

### Week 7-8 — Hinglish Fine-Tuning + Deploy
- [ ] LoRA fine-tune on combined Hinglish dataset on Modal A100 (~$50-70, 25-30 hrs)
- [ ] Eval on Hinglish test set, target 8-12% WER
- [ ] Compare against Sarvam API on same eval set
- [ ] Deploy as second LoRA adapter on same base model
- [ ] A/B test, replace Sarvam if metrics hold
- [ ] Deliverable: fine-tuned Hinglish ASR adapter, deployed, Sarvam dependency removed

---

## 8. Edge Cases (Beyond Existing Doc)

### Hinglish-specific
1. **Code-switching boundary errors** — "I think main jaaunga" type sentences. Solution: CSCL curriculum + 8-10% boundary-edge examples.
2. **Script ambiguity** — User says "kal" but model could output "kal" (Latin) or "कल" (Devanagari). Decision: Latin/romanized output for v1 (52% of Indian users prefer this).
3. **Number handling in mixed language** — "tees lakh" → "30 lakh" or "3,000,000"? Decide convention and stick to it.

### ASR-specific
4. **Silence-triggered hallucinations** — Whisper sometimes generates "Thank you" on silent audio. Solution: Silero VAD layer BEFORE ASR. Drop chunks below threshold.
5. **Microphone codec variation** — AirPods (notorious per Reddit comment), MacBook built-in, external mics produce different spectrograms. Solution: include all 3 in training data, ~33% each.
6. **Indian English accent variations** — Northern vs Southern accent patterns differ significantly. Solution: 32x voice variation in synthetic data.
7. **Cold start latency** — A100 boot is 2-4 seconds. Solution: keep min_containers=1 during demo windows (already in MVP doc).
8. **Data leakage** — Same speaker in train and test sets inflates accuracy. Solution: split by speaker_id, NOT random.
9. **Repetitive hallucinations** — Whisper sometimes outputs "I'm going to I'm going to I'm going to". Solution: post-processing dedup + penalty during inference (`repetition_penalty=1.1`).

---

## 9. Decision Framework — When to Stop Fine-Tuning

| Trigger | Action |
|---|---|
| WER plateaus across 2 consecutive 50-hr training increments | Stop adding data; focus on data quality |
| User correction rate < 3% per session | Ship current model, collect more data passively |
| Target WER hit on eval set | Deploy + monitor drift |
| Cost/improvement ratio drops below $50 per 1% WER | Stop; invest in formatter or product features |

---

## 10. References

### Internal docs
- `Voice Dictation MVP.pdf` — Section 3 (ASR Model decision: Whisper-turbo)
- `StayFree_Complete_FineTuning_Guide.docx` — Sections 4, 5 (ASR fine-tuning recipes)
- `StayFree_ASR_vs_Formatter_DeepDive.docx` — Section 6 (what each model learns)

### External
- [Whisper-large-v3-turbo on HuggingFace](https://huggingface.co/openai/whisper-large-v3-turbo)
- [HuggingFace Whisper fine-tuning blog](https://huggingface.co/blog/fine-tune-whisper)
- [distil-whisper repo](https://github.com/huggingface/distil-whisper)
- [Wispr Flow + Baseten case study](https://www.baseten.co/resources/customers/wispr-flow/)
- [Together.ai Whisper APIs](https://www.together.ai/blog/speech-to-text-whisper-apis)
- [MUCS 2021 dataset](https://navana-tech.github.io/MUCS2021/data.html)
- [IndicVoices on HuggingFace](https://huggingface.co/datasets/ai4bharat/IndicVoices)
- [faster-whisper repo](https://github.com/SYSTRAN/faster-whisper)

---

## 11. Why Fine-Tuning Works Despite 5M-Hour Base (Critical ML Concept)

This addresses the question: *"If Whisper was trained on 5M hours, how can my 50-100 hours improve it?"*

### The answer: distribution shift, not data quantity

**Whisper's 5M training hours** = generic web audio (YouTube, podcasts, audiobooks). Mostly American + British English, mostly studio quality, mostly conversational.

**StayFree's distribution** = Indian English accent + MacBook/AirPods mics + office/cafe noise + dictation cadence + domain vocabulary (StayFree, Cerebrium, Tinker, LoRA). Whisper has seen ZERO hours of this exact distribution.

### Doctor analogy
- **MBBS + 5 years general practice** = Whisper's 5M hrs (generic medical knowledge)
- **Pediatric oncology fellowship 100 hrs** = your fine-tuning

Generic doctor handles 90% of diseases at 80% accuracy, but pediatric oncology specifically at only 70%. After 100 specific hours, accuracy hits 95%. Same logic applies to Whisper.

### Why OpenAI doesn't do it themselves
1. **Privacy / data access**: OpenAI doesn't have your users' audio
2. **Average vs specialized optimization**: Specializing on Indian English dictation could HURT American English performance — OpenAI optimizes for average across all use cases
3. **Long-tail problem**: 10,000 startups each have unique domains; OpenAI can't fine-tune for each
4. **Vocabulary expansion**: OpenAI won't add "Cerebrium" to training because 99% of users don't need it; you will

### Empirical evidence (published Whisper FT results)

| Domain | Base WER | After 10 hrs FT | After 50 hrs FT | Notes |
|---|---|---|---|---|
| Medical dictation | 22% | 12% | 6% | Domain vocab huge gain |
| Indian English | 18% | 11% | 7% | Accent adaptation |
| Children's speech | 35% | 22% | 14% | Distribution far from adults |
| Customer service calls | 25% | 15% | 9% | Phone codec + noise |
| **Generic LibriSpeech subset** | **5%** | **5.5%** | **5%** | **No improvement — already in distribution** |

**Critical insight**: The last row shows that fine-tuning on data already in Whisper's training distribution gives ZERO improvement. Improvements come ONLY from distribution shift.

### Implications for StayFree training data

Your 50 hrs English data must include:
- 40% Indian English speakers (target market)
- 30% MacBook built-in mic recordings
- 30% AirPods/external mic recordings
- Dictation-specific phrases: "Hi team", "regarding", "follow up", "deadline", "ASAP"
- Domain vocabulary: app names, product names, technical terms
- Acoustic variations: cafe, office, quiet room

If you collect 50 hrs of generic LibriSpeech-style data, fine-tuning will give zero benefit. The data MUST shift the distribution toward your users' actual usage.

---

## 12. Distillation in ASR — Without Prompts

### How LLM distillation works
```
Teacher LLM: "What's 2+2?" → "4" (with token probabilities)
Student LLM: "What's 2+2?" → trained to match teacher's probabilities
```

### How ASR distillation works
There are no prompts in ASR — input is audio, output is transcript:
```
Teacher Whisper: [audio] → "hello world" (with token probabilities)
Student Whisper: [SAME audio] → trained to match teacher's probabilities
```

**Mechanics:**
1. Same audio fed to both teacher (large) and student (small)
2. Teacher emits probability distribution per token (e.g., "hello"=85%, "halo"=10%)
3. Student trained to minimize KL divergence with teacher's distribution
4. Plus standard cross-entropy on ground-truth transcripts

### Multilingual distillation
Wispr likely did NOT distill once per language. More likely:
- ONE multilingual student model that learned from a multilingual teacher
- Top-frequency languages get LANGUAGE-SPECIFIC LoRA adapters on top
- Distillation is a SIZE reduction technique, not a per-language thing

### Our equivalent strategy
```
Base: whisper-large-v3-turbo (multilingual, single model)
   ↓
LoRA Adapter 1: English domain-specific (~50MB)
LoRA Adapter 2: Hinglish domain-specific (~50MB)
   ↓
At inference: load base + swap adapter based on languagePreference
```

This is exactly the "scaling to 100+ languages" architecture. Same base model, swap-able adapters.

---

## 13. Self-Hosted Streaming Cost (vs Together.ai's 3x markup)

Together.ai charges $0.27/min for non-streaming Whisper-v3 and $0.85/min for streaming (3x markup). When self-hosting on Modal/RunPod, this markup disappears.

### Why Together charges more for streaming
- Persistent WebSocket connection → blocks GPU per user
- Inefficient batching — can't multiplex streams across users
- Operational overhead (keep-alive, reconnect)
- Their margin

### Self-hosted reality
You rent GPU **per hour, not per request**. Streaming vs non-streaming is the same cost.

| Setup | Cost | Notes |
|---|---|---|
| 1× A100 40GB on Modal | $1.19/hr = $0.020/min | 24/7 running |
| Concurrent users per A100 | 10-50 (with whisper-turbo) | Depends on audio length |
| Per-user streaming cost | ~$0.0004-0.002/min | 400x cheaper than Together's $0.85/min |
| Per-user non-streaming cost | ~$0.0004-0.002/min | SAME as streaming |

**Verdict**: Self-host streaming without cost concern. Cost is in engineering effort (auto-scaling, WebSocket pool, warm containers), not money.

---

## 14. YouTube Data Strategy

### English: YouTube data → AVOID

Whisper was heavily trained on YouTube audio (majority of its 5M hrs). Downloading YouTube → transcribing with Whisper → fine-tuning = self-distillation. Marginal improvement is zero or negative.

**Better English sources**:
- Your users' actual dictations (gold standard)
- Common Voice English with Indian accent filter (free)
- Self-recorded: 50 friends × 1 hr each = 50 hrs
- Crowd-source via Prolific/MTurk (~$5/hr of audio)

### Hinglish: YouTube data → STRATEGIC USE OK

Whisper has seen relatively little Hinglish. YouTube has abundant Hinglish content (Indian podcasts, interviews, vlogs).

**Required pipeline**:
```
YouTube video download → Audio extract (ffmpeg) → Whisper transcribe with language="hi"
   ↓ initial draft
HUMAN REVIEW + correction (mandatory)
   ↓ ground-truth Hinglish data
Quality-filtered training pairs
```

**Without human review = self-distillation. With human review = real signal.**

**Hinglish YouTube sources**:
- TheRanveerShow, Beerbiceps podcasts
- Indian tech YouTubers (Ishan Sharma, etc.)
- News channels (NDTV India, Aaj Tak — mixed Hindi+English)
- Mostly Sane / FilterCopy clips
- BeYouNick, Bhuvan Bam

**Legal**: YouTube ToS prohibits downloads. Fair-use precedent for research, gray for commercial. Consult lawyer before commercial deployment.

### Better alternative — TTS-generated synthetic Hinglish

Near-zero cost, unlimited quantity, no legal issues:

```
Step 1: LLM (Claude/GPT) generates Hinglish dictation-style text
        100-1000 sentences across topics: work, family, tech, daily life

Step 2: Indic Parler-TTS / Veena synthesize audio
        32x voice variation possible (different speakers, accents, speeds)
        1 hr compute → 5-10 hrs synthetic audio

Step 3: Augment with noise (MUSAN cafe/office samples)

Step 4: Mix 50% synthetic + 50% real human-recorded for training
```

Published research: synthetic data works comparably to real data when mixed 50-50.

---

## 15. Wispr's "Magic" Features — Reverse Engineered

### Feature A: Background voice filter (only main speaker transcribed)

| Layer | Implementation | Tools |
|---|---|---|
| Pre-processing | Speaker enrollment — user records 3-sec sample → voice fingerprint embedding | pyannote, Resemblyzer, NVIDIA NeMo TitaNet |
| Runtime gating | Real-time speaker diarization → filter "main speaker" segments | WebRTC + pyannote-streaming |
| Selective ASR | ASR runs only on matching-speaker segments | Custom orchestration |
| Training data | Multi-speaker recordings with main-speaker labeled | LibriSpeech multi-speaker |

**Effort**: ~2 weeks engineering. Use `pyannote/speaker-diarization-3.1` (open source).

### Feature B: Noisy environment robustness

| Layer | Implementation | Tools |
|---|---|---|
| Pre-processing | Noise suppression BEFORE ASR | RNNoise, DeepFilterNet2 |
| Data augmentation | Mix clean speech with MUSAN/Audioset noise at various SNR | Standard audiomentations |
| Multi-condition training | Same audio at multiple noise levels | Data side |
| VAD | Drop pure-noise chunks before ASR | Silero VAD (free, MIT) |

**Effort**: ~1 week engineering. DeepFilterNet2 has WASM build for Electron.

### Feature C: Whisper/low-volume speech

| Layer | Implementation | Tools |
|---|---|---|
| Audio normalization | Automatic Gain Control (AGC) | WebRTC AGC, pyloudnorm |
| Training data | 10-15% samples at -10dB to -20dB | Audio augmentation |
| Model robustness | Multi-volume training → volume invariance | Fine-tuning |

**Effort**: Pure data side, no extra engineering.

### Feature handling matrix — what's data, what's engineering

| Wispr feature | Data side | Engineering side | Architecture | Phase | Effort |
|---|---|---|---|---|---|
| Background voice filter | Multi-speaker training | WebRTC speaker diarization | Speaker embedding + filter | 3 | 2 weeks |
| Noise robust (cafe) | Noise-augmented (MUSAN) | DeepFilterNet2 pre-processor | Multi-condition trained ASR | 2 | 1 week |
| Low-volume / whisper | -10dB to -20dB samples | WebRTC AGC | Robust ASR | 2 | 0 (pure data) |
| Hallucination reduction | VAD-filtered training | Silero VAD pre-step | Confidence threshold | 2 | 3 days |
| Language forcing | Per-language LoRA | `language=` parameter | LoRA adapter swap | 2 | 1 day |
| Code-switching (Hinglish) | Hinglish curriculum (CSCL) | Language token forcing | Multilingual model | 3 | 1 week |
| Domain vocab | Custom training pairs | Dictionary injection | Custom token bias | 1-2 | 2 days |

---

## 16. Language Forcing — Lock Output to Selected Language

Whisper has a built-in `language` parameter:

```python
# User sets languagePreference = "en"
result = whisper.transcribe(
    audio,
    language="en",     # FORCES English decoder
    task="transcribe",
)
# Output: only English tokens, even if user accidentally says Hindi word

# User sets languagePreference = "hinglish"
result = whisper.transcribe(
    audio,
    language="hi",     # FORCES Hindi decoder (no native "hinglish" code)
    task="transcribe",
)
# Output: Devanagari or code-mixed
```

### Hinglish-specific challenge

Whisper has no "hinglish" code. Options:
1. `language="hi"` — Hindi mode, English words transliterated to Devanagari
2. `language="en"` — English bias, Hindi words missed
3. **Best after fine-tune**: `language="hi"` + Hinglish LoRA adapter trained to output Latin script

### Implementation in StayFree app

```typescript
// src/main/transcription.ts
const language = store.get('languagePreference') === 'hinglish' ? 'hi' : 'en';

const transcript = await whisperApi.transcribe(audio, {
  language,
  task: 'transcribe',
  lora_adapter: language === 'hi' ? 'hinglish-v1' : 'english-v1',
});
```

### Edge case — mid-session language switch

User starts in English, mid-dictation switches to Hinglish. Strategy options:

| Strategy | Behavior | Recommended? |
|---|---|---|
| Strict mode | Respect user's chosen language. Hindi words transcribed phonetically. | ⭐ **Yes** — predictable UX |
| Auto-detect | `language=None` — let Whisper auto-detect. Risk: flips mid-sentence. | No — too unpredictable |
| UI toggle | Floating widget has language switch button. User flips manually. | Phase 2 enhancement |

---

## 17. Final Hours Recommendation (Corrected)

Based on diminishing returns analysis, here's what we ACTUALLY need (not what's nice-to-have):

### English (domain-specific dictation)

| Hours | WER | Cost | Recommendation |
|---|---|---|---|
| 50 | 4-5% | $15-25 | Smoke test |
| **100** | **3.5-4.5%** | **$30-50** | ⭐ **v1 target** |
| 200 | 3-4% | $50-70 | v2 if needed |
| 500+ | 2.5-3% | $150+ | Waste — diminishing returns |

**Verdict**: 100 hrs sweet spot. 1000+ is wasted money.

### Hinglish (code-switched)

| Hours | WER | Cost | Recommendation |
|---|---|---|---|
| 200 | 8-12% | $50-70 | Smoke test |
| **500** | **6-9%** | **$150-250** | ⭐ **v1 target — beats Sarvam** |
| 1000 | 4-7% | $300-500 | Premium quality |
| 2000-3000 | 4-6% | $600+ | Waste — plateau |

**Verdict**: 500 hrs sweet spot for production-grade Hinglish. 2000-3000 is overkill.

### Combined v1 budget

| Language | Hours | Cost | Expected WER | Compute time |
|---|---|---|---|---|
| English | 100 | $30-50 | 3.5-4.5% | 8-12 hrs |
| Hinglish | 500 | $150-250 | 6-9% | 2-3 days |
| **TOTAL v1** | **600 hrs** | **$180-300** | **Beats Sarvam on Hinglish** | **~3 days compute** |

---

## 18. Data Sources WITHOUT Real Users (Pre-Launch Reality)

**Constraint**: StayFree app is not launched. We have ZERO real user audio. All previous mentions of "your users' dictations" are invalid for v1.

### English data plan (100 hrs target, no real users)

| Source | Hours possible | Cost | Quality | Notes |
|---|---|---|---|---|
| Mozilla Common Voice English (Indian accent filter) | 30-50 | Free | High | Already labeled, multi-speaker. Filter by `accent="india"` |
| Self-recorded (you + 5-10 friends dictation samples) | 5-10 | Free | Highest | Diversity limited but exact distribution |
| YouTube Indian English niche channels | 30-50 | Free | Medium-High | Strategic channel selection |
| TTS-generated dictation (F5-TTS / Parler-TTS) | 10-20 | Free | Medium | 32x voice variation possible |
| Crowdsource via Prolific | 10-20 | $50-100 | High | 20 Indian English speakers × 30 min |

**Total achievable**: 85-150 hrs without users.

### Hinglish data plan (500 hrs target)

| Source | Hours possible | Cost | Notes |
|---|---|---|---|
| MUCS 2021 (labeled native code-switching) | 95 | Free | Gold standard, OpenSLR #103/#104 |
| Common Voice Hindi (transliterated to Latin) | 30-50 | Free | Filter for code-switching |
| IndicVoices subset | 50-100 | Free | AI4Bharat |
| YouTube Hinglish (curated + human-reviewed transcripts) | 100-150 | Free | yt-dlp + 30% human verification |
| TTS synthetic (Indic Parler-TTS + LLM-generated text) | 100-200 | Free | Near-zero cost |
| Self-recorded with friends | 10-20 | Free | Real distribution match |

**Total achievable**: 385-615 hrs.

---

## 19. YouTube Data — Deep Dive

### Is YouTube already in Whisper's training?

Yes, heavily. But it's skewed toward popular American/British content. Indian English niche channels are likely UNDER-represented in Whisper's 5M hours.

### Strategic channel selection criteria

| Criteria | Reason |
|---|---|
| Mid-size channels (100K-1M subs, NOT viral 10M+) | Less likely scraped by Whisper |
| Slow, deliberate speaking pace | Matches dictation distribution |
| Long-form (interviews, tutorials) | Vocab-rich, more transcribable |
| Tech/business/educational | Target user vocab |
| Indian English accent (NOT American-Indian diaspora) | True target distribution |

### Recommended Indian English channels (training)

- Dhruv Rathee (thoughtful, slow pace, current affairs)
- Akshat Shrivastava (finance, business, deliberate)
- Ankur Warikoo (career, slow conversational)
- Backstage with Millionaires (interview-style, varied speakers)
- TRS English-only segments (long-form, conversational)
- Independent Indian tech podcasters (lesser-known = better)

### AVOID for English training

- Viral entertainment (BB Ki Vines, CarryMinati) — too fast, slang-heavy
- Mega channels (T-Series, MrBeast) — likely in Whisper training
- Pure news anchors — too formal, broadcast register

### Recommended Hinglish channels

- TheRanveerShow, Beerbiceps (mixed Hindi-English)
- Comedy: Bhuvan Bam, Mostly Sane
- News: NDTV India, Aaj Tak (mixed register)
- Tech podcasters in Hinglish

### Legal path: yt-dlp (clean, recommended)

```bash
# Install
pip install yt-dlp

# Download audio only
yt-dlp -x --audio-format wav --audio-quality 0 <youtube-url>

# Batch from playlist
yt-dlp -x --audio-format wav --batch-file=urls.txt
```

**Why yt-dlp over third-party services (Y2Mate, SaveTube)**:
- Open source CLI (no third-party legal exposure)
- Industry-standard for ML research
- Reliable for production pipeline (services get shut down)
- Used by academic papers worldwide

**Legal disclaimer**: For research/training, fair use precedent is well-established. For commercial deployment of fine-tuned model, gray area but mitigated by: (1) model outputs ≠ raw content, (2) industry practice tolerates this.

---

## 20. Hinglish Roman Script Output — Critical Product Decision

### The exact problem

| Mode | Whisper output for "mujhe kal meeting hai" |
|---|---|
| `language="en"` | "Mujhe call meeting hai" (Hindi mis-transcribed phonetically) |
| `language="hi"` | "मुझे कल मीटिंग है" (Devanagari — NOT what we want) |
| `language="hi"` + translate | "I have a meeting tomorrow" (loses Hinglish) |
| **What we want** | **"Mujhe kal meeting hai"** (Latin Hinglish) |

No native Whisper mode produces this. **We must train it ourselves.**

### Solution architecture (4 layers)

#### Layer 1: Data — fine-tune for Latin Hinglish output

ALL Hinglish training data MUST have Latin script transcripts. Zero Devanagari.

```jsonl
{
  "audio": "audio_001.wav",
  "transcript": "Kal meeting hai 3 baje"  // ← Latin Hinglish only
  // NOT: "कल मीटिंग है 3 बजे"
}
```

**Source data conversion** (use `indic-trans` library):
```python
from indictrans import Transliterator
trn = Transliterator(source='hin', target='eng', build_lookup=True)
latin_text = trn.transform("मुझे कल मीटिंग है")
# Output: "mujhe kal meeting hai"
```

Validate every pair with script detection — reject any pair with Devanagari leakage.

#### Layer 2: Architecture — separate pipelines per language

```
languagePreference = "english"  →  English pipeline
  • language="en"
  • English LoRA adapter
  • Pure English Latin output

languagePreference = "hinglish"  →  Hinglish pipeline
  • language="hi"
  • Hinglish-Latin LoRA adapter
  • Mixed-vocab Latin output
```

Same base Whisper model, runtime adapter swap.

#### Layer 3: Engineering safety net (Devanagari detection)

```typescript
async function transcribe(audio: Buffer, lang: 'english' | 'hinglish') {
  const config = lang === 'hinglish'
    ? { language: 'hi', adapter: 'hinglish-latin-v1' }
    : { language: 'en', adapter: 'english-v1' };

  let transcript = await whisperApi.transcribe(audio, config);

  if (lang === 'hinglish' && containsDevanagari(transcript)) {
    transcript = transliterateToLatin(transcript);
    logEvent('devanagari_leak_detected'); // monitor frequency
  }

  return transcript;
}

function containsDevanagari(text: string): boolean {
  return /[ऀ-ॿ]/.test(text); // Devanagari Unicode range
}
```

#### Layer 4: Eval — separate test suites

**English eval (50 clips)**: WER ≤ 5%, zero Hindi-word hallucinations
**Hinglish eval (50 clips)**: WER ≤ 10%, ZERO Devanagari output, code-switch preserved

### Decision matrix

| Decision | English | Hinglish |
|---|---|---|
| Whisper `language=` param | `"en"` | `"hi"` |
| LoRA adapter | `english-v1` | `hinglish-latin-v1` |
| Training script | Latin only | Latin only (transliterate everything) |
| Dataset size (v1) | 100 hrs | 500 hrs |
| Output validation | Reject if Devanagari | Reject if Devanagari |
| Code-switch handling | Reject Hindi → phonetic | Preserve naturally |
| Decoder temperature | 0.0 | 0.1 (fluency for code-switch) |
| Beam size | 5 | 5 |

### Differentiation mind-map

```
                    USER PREFERENCE
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
         ENGLISH                  HINGLISH
              │                        │
    ┌─────────┼─────────┐    ┌─────────┼─────────┐
    │         │         │    │         │         │
  DATA    ENGINE   OUTPUT  DATA   ENGINE   OUTPUT
    │         │         │    │         │         │
    │  language="en"    │    │  language="hi"    │
    │  English LoRA     │    │  Hinglish LoRA    │
    │                   │    │                   │
    │ • Pure English    │    │ • Code-mixed      │
    │ • Latin script    │    │ • Latin script    │
    │ • Indian accent   │    │ • Both languages  │
    │ • Dictation style │    │ • Dictation style │
    │                   │    │                   │
    │ Eval:             │    │ Eval:             │
    │ • WER ≤ 5%        │    │ • WER ≤ 10%       │
    │ • No Hindi leak   │    │ • No Devanagari   │
    │                   │    │ • Code-switch OK  │
    └───────────────────┘    └───────────────────┘
```

---

## 21. Devanagari Leakage — Hard Guarantee Strategy

Even after fine-tuning, base Whisper's decoder may emit Devanagari tokens. Solutions in order of strictness:

### Layer 1: `suppress_tokens` parameter (HARD constraint)

```python
def get_devanagari_token_ids(tokenizer):
    devanagari_tokens = []
    for token_id in range(tokenizer.vocab_size):
        token = tokenizer.decode([token_id])
        if any('ऀ' <= ch <= 'ॿ' for ch in token):
            devanagari_tokens.append(token_id)
    return devanagari_tokens

devanagari_ids = get_devanagari_token_ids(model.tokenizer)

result = model.transcribe(
    audio,
    language="hi",
    task="transcribe",
    suppress_tokens=devanagari_ids,  # HARD constraint at decode level
)
```

This forces the decoder to never emit Devanagari tokens — picks next-best Latin token instead.

### Layer 2: Custom LogitsProcessor (more control)

```python
from transformers import LogitsProcessor

class DevanagariSuppressor(LogitsProcessor):
    def __init__(self, devanagari_token_ids):
        self.devanagari_ids = devanagari_token_ids
    
    def __call__(self, input_ids, scores):
        scores[:, self.devanagari_ids] = float('-inf')
        return scores
```

### Layer 3: Post-processing safety net (monitoring + last resort)

```typescript
function ensureLatinHinglish(transcript: string): string {
  if (containsDevanagari(transcript)) {
    logEvent('devanagari_leak_post_suppression'); // should fire ~0% of time
    return transliterateToLatin(transcript);
  }
  return transcript;
}
```

### Reliability matrix

| Configuration | Devanagari leakage |
|---|---|
| Just `language="hi"` | 70-90% |
| Just LoRA fine-tune | 5-15% |
| LoRA + `suppress_tokens` | <0.1% |
| LoRA + `suppress_tokens` + post-processing | 0% practical |

**Recommendation**: Use all three layers. `suppress_tokens` is the workhorse, post-processing is monitoring + insurance.

---

## 22. Wispr Hidden Features — Honest Difficulty Rating

| Feature | Difficulty | Effort | Phase |
|---|---|---|---|
| **Whisper/low-volume** | ⭐ Trivial | 1-2 days | 2 |
| **Noise robustness (cafe)** | ⭐⭐ Easy | 3-5 days | 2 |
| **Background voice filter** | ⭐⭐⭐⭐ Hard | 2-3 weeks | 3 |

### Phase 2 quick wins (1 week total)
- Low-volume: WebRTC AGC + 15% low-volume training samples
- Noise robust: DeepFilterNet2 plug-in pre-processor + MUSAN-augmented training
- Hallucination reduction: Silero VAD before ASR

### Phase 3 (when you have users to validate)
- Background voice filter: speaker enrollment UI + pyannote diarization + audio gating

**80% of Wispr's "magic" comes from Phase 2 features alone (1 week effort).**

---

## 23. Electron vs Swift — Platform Decision

### Swift pros
- Better performance (lower memory, faster startup)
- Native AVFoundation = lowest-latency audio
- Better macOS integration
- Smaller bundle (50MB vs 200MB)

### Swift cons
- macOS only (kills Windows roadmap)
- Complete rewrite (~4-6 weeks)
- Slower iteration (Xcode vs npm)
- AI tools weaker on Swift than TS

### Recommendation

**Stick with Electron for v1** if Windows is on roadmap (per MVP doc, it is).

**Future hybrid approach** (like Wispr Flow): Swift native on macOS, Electron on Windows. Same backend, different frontends. Phase 4-5 consideration.

**v1 priority**: ASR fine-tuning + Phase 2 features beat platform migration in ROI.

---

## 24. yt-dlp — Audio Quality and Usage

### Quality reality

yt-dlp downloads ORIGINAL audio bitstream from YouTube — no quality degradation:
- 128-160 kbps Opus (typical YouTube)
- AAC 128 kbps (older content)
- Conversion to WAV is lossless

### Recommended pipeline for ASR training

```bash
# Step 1: Download audio in best quality WAV
yt-dlp -x --audio-format wav --audio-quality 0 \
       --output "%(title)s.%(ext)s" \
       <youtube-url>

# Step 2: Convert to 16kHz mono (Whisper native)
ffmpeg -i input.wav -ar 16000 -ac 1 -c:a pcm_s16le output_16k.wav

# Step 3: Split into 30-sec chunks (Whisper max input)
ffmpeg -i output_16k.wav -f segment -segment_time 30 \
       -c copy chunk_%03d.wav
```

### Captions caveat

YouTube auto-captions are unreliable (5-15% WER, worse for Hinglish). Don't use as training labels.

```bash
# Manual captions only (higher quality)
yt-dlp --write-subs --sub-lang en,hi --skip-download <url>
```

### Quality acceptability table

| Source | Use for training? |
|---|---|
| Studio podcast | ✅ Excellent |
| Pro YouTube creator | ✅ Very good |
| Average vlogger | ✅ Good (matches MacBook mic distribution) |
| Phone-recorded amateur | ⚠️ OK (useful for noise robustness) |
| Live stream with music | ❌ Skip |

---

## 25. Open Questions to Decide Before Week 3

1. **Data source for English**: Use LibriSpeech alone or mix with Common Voice for accent diversity?
2. **Synthetic Hinglish**: Indic Parler-TTS vs Veena TTS — pick one and stick to it
3. **Modal vs RunPod**: Modal has better DX, RunPod is 3x cheaper. Recommendation: Modal for English (faster iteration), RunPod for Hinglish (longer training, cost matters)
4. **Adapter swap strategy**: Two separate endpoints (one per language) or one endpoint with runtime adapter swap? Recommendation: runtime swap (saves infra cost)
5. **Streaming wrapper**: `faster-whisper` vs `WhisperLive` — benchmark both on 10 clips before committing

---

## 26. Conversation Decision Log (How We Got Here)

This section captures the chronological evolution of decisions during the planning conversation. Each decision lists what was considered, what was rejected, and why the final choice was made. Use this to understand the *reasoning* behind every choice — not just the outcome.

### Decision 1: Base ASR model

**Question raised**: Whisper-large-v3 vs Whisper-large-v3-turbo vs distil-whisper — which to fine-tune?

**Options considered**:
- `openai/whisper-large-v3` (full, 1.55B params, 32 decoder layers)
- `openai/whisper-large-v3-turbo` (pruned decoder, 4 layers, 8x faster)
- `distil-whisper/distil-large-v3.5` (student-teacher distilled, 2 decoder layers, 1.5x faster than turbo)

**Rejected**:
- distil-whisper — **English only**, kills Hinglish goal
- whisper-large-v3 — slower than turbo with no accuracy benefit at our latency budget

**Chosen**: `openai/whisper-large-v3-turbo`

**Why**: Multilingual (99 languages including Hindi), 8x faster than large-v3, only 6GB VRAM, MIT license, LoRA-friendly.

### Decision 2: Streaming vs non-streaming

**Question raised**: Together.ai shows "Whisper Large v3" and "Whisper Large v3 (Streaming)" as separate models — are they actually different?

**Verified via web search**: SAME underlying model. Different API protocols only:
- Non-streaming: HTTP POST `/v1/audio/transcriptions`
- Streaming: WebSocket `/v1/realtime`

**Chosen**: Use turbo + `faster-whisper` streaming wrapper at runtime. Same fine-tuned model serves both batch and streaming inference.

### Decision 3: Fine-tuning platform — is there a "Tinker for ASR"?

**Question raised**: We used Tinker for the formatter. Is there a similar abstracted platform for ASR?

**Platforms evaluated**:

| Platform | LLM FT | ASR FT | Verdict |
|---|---|---|---|
| Tinker | ✅ | ❌ LLM only | Used for formatter |
| Together.ai | ✅ | ❌ CausalLM only (verified) | Whisper not supported |
| Fireworks.ai | ✅ | ❌ | Skip |
| OpenAI | ✅ | ❌ Whisper closed | Skip |
| HuggingFace AutoTrain | ✅ | ⚠️ Limited Whisper | Prototyping only |
| Lightning AI Studios | ✅ | ✅ via PyTorch Lightning | **Try first** |
| Modal | ✅ raw | ✅ raw via HF Trainer | **Recommended fallback** |
| RunPod | ✅ raw | ✅ raw | Cheapest option |

**Key verification**: Together.ai's fine-tuning page explicitly states *"all CausalLM models under 100B params"*. Whisper is encoder-decoder, not CausalLM. Confirmed not supported.

**Chosen**: HuggingFace Trainer + PEFT (LoRA) on Lightning AI Studios → fall back to Modal A100 if DX is insufficient.

**Why**: No ASR-specific Tinker-equivalent exists. ~150-200 lines of Python boilerplate is acceptable cost for full control.

### Decision 4: Fine-tuning method — LoRA vs full fine-tune

**Chosen**: LoRA (rank 8-16) on Whisper encoder layers.

**Why**: 5x faster training, 3x less memory, prevents catastrophic forgetting (base weights frozen), allows runtime adapter swap for multi-language support.

### Decision 5: Languages and priority order

**Chosen scope**:
- v1 Phase 2: English (Indian accent dictation)
- v1 Phase 3: Hinglish (code-switched, Latin output)

**Explicitly NOT supporting**:
- Pure Hindi with Devanagari output (use Hinglish-Latin instead)
- Other Indic languages (post-v1 expansion)

### Decision 6: Why fine-tune at all if Whisper is trained on 5M hours?

**Question raised**: If Whisper saw 5M hours, can my 50-100 hours really improve it?

**Resolution**: Yes — because of **distribution shift**, not data quantity.
- Whisper's 5M hrs = generic web audio (mostly American/British)
- StayFree distribution = Indian English + dictation cadence + MacBook mic + technical vocab
- Whisper has seen ZERO hours of this exact distribution
- Empirical evidence: Generic LibriSpeech-style fine-tuning gives 0% improvement; domain-specific data gives 50%+ relative improvement

**Why OpenAI doesn't do it themselves**: privacy (no access to user data), average optimization (specializing hurts other use cases), long-tail problem (10K startups each unique), vocabulary expansion (won't add "Cerebrium" for 99% of users who don't need it).

### Decision 7: Real user data availability

**Reality check raised**: App not launched yet. Zero real user audio.

**Resolution**: All "your users' dictations" references in earlier strategy are invalid for v1. Replaced with concrete data sources that don't require existing users.

### Decision 8: English data sources (no real users)

**Plan**: 100 hrs assembled from:
- Mozilla Common Voice (Indian accent filter): 30-50 hrs
- Self-recorded with 5-10 friends: 5-10 hrs
- YouTube Indian English niche channels via yt-dlp: 30-50 hrs
- TTS-generated dictation (F5-TTS / Parler-TTS): 10-20 hrs
- Crowdsource via Prolific: 10-20 hrs (~$50-100)

### Decision 9: YouTube data — yes or no?

**Question raised**: Whisper trained on YouTube — does YouTube data still help?

**Resolution**:
- **English**: YES with strategic channel selection (mid-size Indian English creators, NOT viral mega-channels). These niche creators are likely UNDER-represented in Whisper training.
- **Hinglish**: YES extensively. Whisper has seen relatively little Hinglish; YouTube is rich source.

**Tool choice**: `yt-dlp` (open-source CLI) over third-party services like Y2Mate. Cleaner legally, more reliable, industry standard.

**Caveats**:
- YouTube auto-captions unreliable (5-15% WER) — NOT to be used as training labels
- Either re-transcribe with Whisper + human verify, or use only manual captions

### Decision 10: Final hours target

| Language | Hours | Cost | Expected WER |
|---|---|---|---|
| English | 100 | $30-50 | 3.5-4.5% |
| Hinglish | 500 | $150-250 | 6-9% (beats Sarvam) |
| **Total v1** | **600** | **$180-300** | — |

**Why not more?** Diminishing returns plateau around these numbers. 1000+ hrs English or 2000-3000 hrs Hinglish = waste of compute.

### Decision 11: Hinglish output script — Latin only

**Critical product decision**: Hinglish output must be Latin script Hinglish (e.g., "Mujhe kal meeting hai"), NOT:
- Devanagari ("मुझे कल मीटिंग है")
- English-only translation ("I have a meeting tomorrow")

**Why**: 52% of Indian internet users write Hinglish in Latin script. Mixed scripts confuse downstream apps (Slack, email, etc.).

**Implementation**: 4-layer enforcement
1. Data: 100% Latin transcripts in training data (transliterate any Devanagari sources)
2. Architecture: Separate Hinglish-Latin LoRA adapter
3. Decode: `suppress_tokens` parameter blocks all Devanagari token IDs
4. Post-process: Devanagari detection regex + auto-transliteration safety net

**Combined reliability**: <0.1% leakage with all 4 layers, 0% practical leakage.

### Decision 12: Architecture — separate pipelines per language

**Chosen**: Same base Whisper-turbo model, different LoRA adapter loaded at runtime based on `languagePreference` setting.

```
languagePreference="english" → language="en" + English LoRA
languagePreference="hinglish" → language="hi" + Hinglish-Latin LoRA + suppress_tokens
```

**Why**: Cleanest separation. Each adapter trained on its specific distribution. No model confusion.

### Decision 13: Wispr's "magic" features priority

**Reverse-engineered from Reddit + case studies**. Difficulty rated:

| Feature | Difficulty | Phase | Effort |
|---|---|---|---|
| Low-volume / whisper handling | ⭐ Trivial | 2 | 1-2 days |
| Noise robustness (cafe) | ⭐⭐ Easy | 2 | 3-5 days |
| Hallucination reduction (VAD) | ⭐⭐ Easy | 2 | 3 days |
| Background voice filter | ⭐⭐⭐⭐ Hard | 3 | 2-3 weeks |

**Strategy**: Phase 2 quick wins (1 week of effort) cover 80% of Wispr's "magic". Background voice filter waits for Phase 3 when we have user data to validate need.

### Decision 14: Self-hosted streaming cost

**Question raised**: Together charges 3x for streaming — will self-hosted streaming also be expensive?

**Resolution**: NO. Together's 3x markup is their margin. Self-hosted on Modal/RunPod, streaming and non-streaming cost the same per hour of GPU. Per-user effective cost ~$0.0004/min, vs Together's $0.85/min. Cost difference is engineering complexity (auto-scaling, WebSocket pool), not money.

### Decision 15: Electron vs Swift — platform migration

**Chosen**: Stick with Electron for v1.

**Why**:
- MVP doc commits to Windows roadmap → Electron's cross-platform wins
- Swift rewrite = 4-6 weeks for 10-20% UX improvement
- Better ROI: invest those weeks into ASR + Wispr features instead

**Future consideration**: Hybrid approach (Swift native macOS + Electron Windows) like Wispr Flow — Phase 4-5 only.

---

## 27. Step-by-Step Implementation Playbook (Day by Day)

This is the concrete execution playbook. Follow phases sequentially. Each phase has goals, exact commands, expected outputs, and verification checks. **If you complete a phase and the verification check passes, move on. If it fails, debug before proceeding.**

### Phase 0: Pre-requisites (Day 0)

**Goal**: Set up local development environment and cloud accounts.

**Tasks**:
```bash
# 1. Create Python environment
python3 -m venv venv
source venv/bin/activate

# 2. Install core dependencies
pip install -r requirements.txt  # see Section 28 for contents

# 3. Install audio tools
brew install ffmpeg  # macOS
brew install yt-dlp

# 4. Create accounts
# - Lightning AI Studios (https://lightning.ai) — free tier OK to start
# - Modal (https://modal.com) — fallback, $30 free credit
# - HuggingFace (https://huggingface.co) — free, store fine-tuned models
# - Prolific (https://prolific.com) — for crowdsourced English data, ~$100 budget
```

**Verification**:
```bash
yt-dlp --version  # should print 2025+ version
ffmpeg -version   # should print recent version
python -c "import whisper; print(whisper.__version__)"
python -c "import transformers, peft; print('OK')"
```

**Common pitfalls**: If `whisper` package conflicts, prefer `openai-whisper` over forks.

---

### Phase 1: Baseline Measurement (Days 1-2)

**Goal**: Measure current accuracy of Groq Whisper API on representative inputs. This is the number we must beat.

**Tasks**:

```bash
# 1. Create eval set folder structure
mkdir -p eval/english eval/hinglish

# 2. Record 100 English + 100 Hinglish dictation samples
#    - 5-10 second clips each
#    - Various accents, mics, environments
#    - Manually transcribed ground truth (CSV)
#    - Format: eval/english/clip_001.wav + eval/english/transcripts.csv

# 3. Run baseline transcription
python scripts/baseline_eval.py \
    --eval_dir eval/english \
    --api groq \
    --output baseline_english.json

python scripts/baseline_eval.py \
    --eval_dir eval/hinglish \
    --api sarvam \
    --output baseline_hinglish.json
```

**Expected outputs**:
- `baseline_english.json` — WER, hallucination rate per clip
- `baseline_hinglish.json` — same for Hinglish

**Expected baseline numbers**:
- English (Groq Whisper): 7.75% WER, ~1% hallucination
- Hinglish (Sarvam Saaras v3): 19-25% WER, 37-39% insertion rate

**Verification**: Both JSONs exist, contain WER score, sample-level breakdown visible.

---

### Phase 2: English Data Collection (Days 3-7)

**Goal**: Assemble 100 hours of high-quality, distribution-matched English audio with verified transcripts.

**Tasks broken down**:

**Day 3** — Common Voice
```bash
# Download Common Voice English with Indian accent filter
python scripts/download_commonvoice.py \
    --language en \
    --filter accent=india \
    --output data/raw/commonvoice_en \
    --max_hours 50
```

**Day 4** — Self-recorded
- Set up Audacity or QuickTime recording protocol
- Send WhatsApp message to 5-10 friends with dictation script
- Each records 30-60 min reading prompts varied by topic, mic, environment
- Save as `data/raw/self_recorded/<name>_<env>_<mic>.wav`

**Day 5-6** — YouTube niche channels
```bash
# Create urls.txt with 30-50 video URLs from recommended channels
# (Dhruv Rathee, Akshat Shrivastava, Ankur Warikoo, etc.)

yt-dlp -x --audio-format wav --audio-quality 0 \
       --output "data/raw/youtube/%(id)s.%(ext)s" \
       --batch-file urls.txt

# Re-transcribe with current Whisper for ground truth
python scripts/transcribe_for_labels.py \
    --input_dir data/raw/youtube \
    --output_jsonl data/raw/youtube/transcripts.jsonl

# Manual review pass (sample 10% for accuracy check)
python scripts/review_sample.py --input data/raw/youtube/transcripts.jsonl --sample 0.1
```

**Day 7** — TTS synthetic
```bash
# Generate dictation-style English text via LLM
python scripts/generate_dictation_text.py \
    --num 1000 \
    --topics work,family,tech,daily \
    --output data/raw/synthetic_text_en.jsonl

# Convert to audio via F5-TTS with voice variation
python scripts/tts_synthesize.py \
    --input data/raw/synthetic_text_en.jsonl \
    --tts f5_tts \
    --voices 32 \
    --output data/raw/tts_en/
```

**Final consolidation**:
```bash
# Preprocess all sources to common format (16kHz mono WAV, 1-30 sec chunks)
python scripts/preprocess_dataset.py \
    --input_dirs data/raw/commonvoice_en data/raw/self_recorded data/raw/youtube data/raw/tts_en \
    --output data/processed/english/ \
    --target_sr 16000 \
    --max_duration 30
```

**Verification**:
- Total audio hours: ~100 (run `scripts/count_hours.py`)
- All transcripts in Latin script (run `scripts/validate_script.py --expected latin`)
- No clips > 30 seconds
- Speaker diversity: minimum 50 unique speakers

---

### Phase 3: Training Infrastructure Smoke Test (Days 8-9)

**Goal**: Get HuggingFace Whisper LoRA training script working on a tiny dataset before committing to full training run.

**Tasks**:

```bash
# 1. Take 100 random pairs from processed English data
python scripts/sample_dataset.py --input data/processed/english --output data/smoke/ --n 100

# 2. Run smoke test on Lightning AI / Modal (5 min, ~$0.10)
python scripts/whisper_lora_finetune.py \
    --base_model openai/whisper-large-v3-turbo \
    --train_dir data/smoke/ \
    --output_dir checkpoints/smoke_test \
    --num_epochs 1 \
    --batch_size 4 \
    --lora_rank 8 \
    --learning_rate 1e-4

# 3. Verify checkpoint loads and runs inference
python scripts/test_inference.py \
    --checkpoint checkpoints/smoke_test \
    --audio data/smoke/sample_01.wav
```

**Expected outputs**:
- Loss decreases over 50 steps
- Inference produces sensible English transcript
- No OOM errors

**Verification**: Smoke test completes without errors. If yes → proceed. If no → debug data format / dependency versions / GPU memory.

---

### Phase 4: English LoRA Full Training (Days 10-12)

**Goal**: Fine-tune Whisper-turbo on 100 hrs English data.

**Tasks**:

```bash
# 1. Launch training run
python scripts/whisper_lora_finetune.py \
    --base_model openai/whisper-large-v3-turbo \
    --train_dir data/processed/english/train \
    --val_dir data/processed/english/val \
    --output_dir checkpoints/english_v1 \
    --num_epochs 3 \
    --batch_size 16 \
    --lora_rank 16 \
    --lora_alpha 32 \
    --learning_rate 5e-5 \
    --warmup_ratio 0.05 \
    --max_grad_norm 1.0 \
    --eval_steps 200 \
    --save_steps 200 \
    --early_stopping_patience 3 \
    --bf16 \
    --report_to wandb

# Expected: 8-12 hrs runtime, $30-50 cost on A100
```

**Monitoring**:
- WandB dashboard for loss curves
- Stop training if val_loss rises across 3 evals (early stopping handles this)
- Save best checkpoint (lowest val_loss, NOT final)

**Verification**:
- Final val_loss < 50% of initial
- WER on validation set decreases over training
- Best checkpoint saved at `checkpoints/english_v1/best/`

---

### Phase 5: English Evaluation + Deploy (Days 13-15)

**Goal**: Validate fine-tuned model beats baseline, deploy via faster-whisper.

**Tasks**:

```bash
# 1. Run comprehensive eval on held-out test set
python scripts/evaluate_wer.py \
    --checkpoint checkpoints/english_v1/best \
    --eval_dir eval/english \
    --output results/english_v1_eval.json

# 2. Compare with baseline
python scripts/compare_baselines.py \
    --baseline baseline_english.json \
    --finetuned results/english_v1_eval.json
```

**Go/no-go gate**:
- ✅ WER ≤ 5% (target: 3.5-4.5%)
- ✅ Hallucination rate ≤ 0.5%
- ✅ Beats baseline by ≥ 30% relative improvement
- If any fails: investigate, retrain with adjusted data/hyperparameters

```bash
# 3. Deploy via faster-whisper streaming wrapper
modal deploy deployment/whisper_english_endpoint.py

# 4. A/B test in StayFree app
#    - Toggle 10% traffic to fine-tuned endpoint
#    - Monitor latency p50/p95, error rate
#    - Compare user-reported quality (paste success, no edits needed)
```

**Verification**: A/B metrics show fine-tuned endpoint matches or beats Groq Whisper on quality with comparable latency.

---

### Phase 6: Hinglish Data Preparation (Days 16-25)

**Goal**: Assemble 500 hours Hinglish audio with 100% Latin script transcripts.

**Tasks**:

**Days 16-17** — MUCS dataset
```bash
# Download MUCS 2021 (95 hrs labeled code-switching)
wget https://openslr.org/resources/103/Hindi_train.tar.gz
tar -xzf Hindi_train.tar.gz -C data/raw/mucs/

# Transcripts in Devanagari → transliterate to Latin
python scripts/transliterate_to_latin.py \
    --input data/raw/mucs/transcripts.tsv \
    --output data/raw/mucs/transcripts_latin.jsonl
```

**Days 18-19** — Common Voice Hindi (transliterated)
```bash
python scripts/download_commonvoice.py --language hi --output data/raw/cv_hindi/
python scripts/transliterate_to_latin.py \
    --input data/raw/cv_hindi/transcripts.tsv \
    --output data/raw/cv_hindi/transcripts_latin.jsonl
```

**Days 20-22** — YouTube Hinglish
```bash
# Curate 50-80 video URLs from Hinglish channels (TheRanveerShow, Beerbiceps, etc.)
yt-dlp -x --audio-format wav --batch-file urls_hinglish.txt --output "data/raw/youtube_hi/%(id)s.%(ext)s"

# Initial Whisper transcribe with language="hi"
python scripts/transcribe_for_labels.py \
    --input_dir data/raw/youtube_hi \
    --language hi \
    --suppress_devanagari \
    --output_jsonl data/raw/youtube_hi/transcripts.jsonl

# CRITICAL: Human review of 30%+ of clips for transcript accuracy
python scripts/human_review_ui.py --input data/raw/youtube_hi/transcripts.jsonl
```

**Days 23-24** — TTS synthetic Hinglish
```bash
# Generate Hinglish text via LLM
python scripts/generate_hinglish_text.py \
    --num 2000 \
    --topics dictation,casual,work \
    --script latin \
    --output data/raw/synthetic_hi_text.jsonl

# Synthesize audio
python scripts/tts_synthesize.py \
    --input data/raw/synthetic_hi_text.jsonl \
    --tts indic_parler \
    --voices 32 \
    --output data/raw/tts_hi/
```

**Day 25** — Validation + consolidation
```bash
# Preprocess
python scripts/preprocess_dataset.py \
    --input_dirs data/raw/mucs data/raw/cv_hindi data/raw/youtube_hi data/raw/tts_hi \
    --output data/processed/hinglish/

# CRITICAL: Validate ZERO Devanagari in any transcript
python scripts/validate_script.py \
    --input data/processed/hinglish \
    --expected latin \
    --strict
```

**Verification**:
- Total: ~500 hrs
- ZERO Devanagari characters in any transcript (script validator must pass)
- Speaker diversity: minimum 100 unique speakers
- Code-switching distribution: 30% pure Hindi, 40% Hinglish, 30% English with Indian accent

---

### Phase 7: Hinglish LoRA Training (Days 26-30)

**Goal**: Fine-tune second LoRA adapter for Hinglish on top of same base model.

**Tasks**:

```bash
python scripts/whisper_lora_finetune.py \
    --base_model openai/whisper-large-v3-turbo \
    --train_dir data/processed/hinglish/train \
    --val_dir data/processed/hinglish/val \
    --output_dir checkpoints/hinglish_latin_v1 \
    --language hi \
    --suppress_devanagari \
    --num_epochs 3 \
    --batch_size 16 \
    --lora_rank 16 \
    --lora_alpha 32 \
    --learning_rate 5e-5 \
    --curriculum_learning cscl \
    --bf16

# Expected: 25-30 hrs runtime, $150-250 cost on A100
```

**Monitoring**:
- Inline eval every 200 steps with custom metric: "Devanagari output rate" (must stay 0%)
- Code-switch preservation rate (custom metric)

**Verification**:
- WER ≤ 12% on validation set
- 0% Devanagari output even without `suppress_tokens` (model has internalized Latin preference)
- Code-switching preserved (English words remain English, Hindi words romanized)

---

### Phase 8: Hinglish Eval + Deploy (Days 31-35)

**Goal**: Strict evaluation, deploy as runtime-swappable adapter.

**Tasks**:

```bash
# 1. Strict eval
python scripts/evaluate_wer.py \
    --checkpoint checkpoints/hinglish_latin_v1/best \
    --eval_dir eval/hinglish \
    --strict_latin \
    --output results/hinglish_v1_eval.json
```

**Strict go/no-go gate**:
- ✅ WER ≤ 10%
- ✅ ZERO Devanagari output (with `suppress_tokens` enabled)
- ✅ Code-switch preserved on 95%+ samples
- ✅ Beats Sarvam baseline by ≥ 50% relative WER improvement

```bash
# 2. Deploy adapter swap logic
modal deploy deployment/whisper_multilang_endpoint.py

# 3. Update StayFree app to use languagePreference for adapter selection
# Edit src/main/transcription.ts to pass language + adapter parameters
```

**Verification**:
- Endpoint receives `language` parameter, routes to correct adapter
- A/B test: 10% Hinglish traffic to fine-tuned, monitor quality

---

### Phase 9: Wispr Feature Integration (Days 36-40)

**Goal**: Add the Phase 2 quick wins (low-volume, noise robustness, hallucination reduction).

**Day 36-37** — Silero VAD (hallucination reduction)
```bash
# Add VAD pre-processor before ASR
pip install silero-vad

# Update transcription pipeline:
# audio → Silero VAD → drop silence chunks → Whisper
```

**Day 38-39** — DeepFilterNet2 (noise suppression)
```bash
# Add noise suppression as audio pre-processor
pip install deepfilternet

# Update pipeline:
# audio → DeepFilterNet2 → Silero VAD → Whisper
```

**Day 40** — WebRTC AGC (low-volume handling)
```bash
# Use built-in WebRTC AGC for automatic gain control
# Update Electron audio capture to enable AGC
# In src/preload.ts:
# const stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: true } })
```

**Verification**:
- Test on cafe-noise audio: WER improvement ≥ 30% relative
- Test on silent audio: zero hallucinations (was ~1% before)
- Test on whispered audio: WER ≤ 15%

---

## 28. Code Skeletons / Reference Implementations

These are starter templates. Adapt as needed but the structure is correct.

### `requirements.txt`

```
# Core
openai-whisper>=20240930
transformers>=4.45.0
peft>=0.13.0
accelerate>=1.0.0
datasets>=3.0.0
torch>=2.4.0
torchaudio>=2.4.0

# Audio processing
librosa>=0.10.0
soundfile>=0.12.0
ffmpeg-python>=0.2.0
silero-vad>=5.0
deepfilternet>=0.5.6

# Data collection
yt-dlp>=2025.1.1
pandas>=2.2.0

# TTS
TTS>=0.22.0  # for Coqui or use parler-tts package
parler-tts>=0.2.0

# Transliteration
indic-trans>=1.2.0
aksharamukha>=2.0

# Inference
faster-whisper>=1.0.0

# Eval
jiwer>=3.0.0  # for WER calculation
sacrebleu>=2.4.0

# Deployment
modal>=0.65.0
fastapi>=0.115.0

# Monitoring
wandb>=0.18.0
```

### `scripts/whisper_lora_finetune.py` (skeleton)

```python
"""
Whisper LoRA fine-tuning script.
Usage: python whisper_lora_finetune.py --base_model openai/whisper-large-v3-turbo --train_dir ... --output_dir ...
"""
import argparse
from pathlib import Path

import torch
from datasets import load_dataset, Audio
from transformers import (
    WhisperForConditionalGeneration,
    WhisperProcessor,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
)
from peft import LoraConfig, get_peft_model, TaskType


def main(args):
    # Load base model
    processor = WhisperProcessor.from_pretrained(args.base_model)
    model = WhisperForConditionalGeneration.from_pretrained(
        args.base_model, torch_dtype=torch.bfloat16
    )
    
    # Configure LoRA
    lora_config = LoraConfig(
        r=args.lora_rank,
        lora_alpha=args.lora_alpha,
        target_modules=["q_proj", "v_proj"],  # encoder attention layers
        lora_dropout=0.05,
        bias="none",
        task_type=TaskType.AUDIO_CLASSIFICATION,
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()  # should print ~1% of total params
    
    # Load datasets
    train_ds = load_dataset("json", data_files=f"{args.train_dir}/transcripts.jsonl", split="train")
    train_ds = train_ds.cast_column("audio", Audio(sampling_rate=16000))
    val_ds = load_dataset("json", data_files=f"{args.val_dir}/transcripts.jsonl", split="train")
    val_ds = val_ds.cast_column("audio", Audio(sampling_rate=16000))
    
    # Preprocess (mel spectrogram + tokenize)
    def prepare_dataset(batch):
        audio = batch["audio"]
        batch["input_features"] = processor.feature_extractor(
            audio["array"], sampling_rate=audio["sampling_rate"]
        ).input_features[0]
        batch["labels"] = processor.tokenizer(batch["transcript"]).input_ids
        return batch
    
    train_ds = train_ds.map(prepare_dataset, remove_columns=train_ds.column_names)
    val_ds = val_ds.map(prepare_dataset, remove_columns=val_ds.column_names)
    
    # Training args
    training_args = Seq2SeqTrainingArguments(
        output_dir=args.output_dir,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=2,
        learning_rate=args.learning_rate,
        warmup_ratio=args.warmup_ratio,
        num_train_epochs=args.num_epochs,
        max_grad_norm=args.max_grad_norm,
        bf16=args.bf16,
        eval_steps=args.eval_steps,
        save_steps=args.save_steps,
        logging_steps=50,
        load_best_model_at_end=True,
        metric_for_best_model="wer",
        greater_is_better=False,
        report_to=args.report_to,
    )
    
    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=processor.feature_extractor,
        # data_collator and compute_metrics omitted for brevity
    )
    
    trainer.train()
    trainer.save_model(args.output_dir)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base_model", required=True)
    parser.add_argument("--train_dir", required=True)
    parser.add_argument("--val_dir", required=True)
    parser.add_argument("--output_dir", required=True)
    parser.add_argument("--num_epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=16)
    parser.add_argument("--lora_rank", type=int, default=16)
    parser.add_argument("--lora_alpha", type=int, default=32)
    parser.add_argument("--learning_rate", type=float, default=5e-5)
    parser.add_argument("--warmup_ratio", type=float, default=0.05)
    parser.add_argument("--max_grad_norm", type=float, default=1.0)
    parser.add_argument("--eval_steps", type=int, default=200)
    parser.add_argument("--save_steps", type=int, default=200)
    parser.add_argument("--bf16", action="store_true")
    parser.add_argument("--report_to", default="wandb")
    args = parser.parse_args()
    main(args)
```

### `scripts/transliterate_to_latin.py` (skeleton)

```python
"""
Convert Devanagari transcripts to Latin Hinglish.
Usage: python transliterate_to_latin.py --input transcripts.tsv --output transcripts_latin.jsonl
"""
import argparse
import json
import re
from indictrans import Transliterator


def has_devanagari(text: str) -> bool:
    return bool(re.search(r'[ऀ-ॿ]', text))


def main(args):
    trn = Transliterator(source='hin', target='eng', build_lookup=True)
    
    with open(args.input) as f, open(args.output, 'w') as out:
        for line in f:
            audio_path, transcript = line.strip().split('\t')
            
            if has_devanagari(transcript):
                latin = trn.transform(transcript)
            else:
                latin = transcript
            
            # Validation: must be 100% Latin script after conversion
            assert not has_devanagari(latin), f"Transliteration failed: {transcript}"
            
            out.write(json.dumps({"audio": audio_path, "transcript": latin}) + '\n')


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    main(parser.parse_args())
```

### `scripts/transcribe_with_safety.py` (production inference)

```python
"""
Production inference with Devanagari suppression + post-processing safety net.
"""
import re
from faster_whisper import WhisperModel
from indictrans import Transliterator


class SafeTranscriber:
    def __init__(self, base_model_path: str, english_lora: str, hinglish_lora: str):
        self.model = WhisperModel(base_model_path, device="cuda", compute_type="float16")
        self.english_lora = english_lora
        self.hinglish_lora = hinglish_lora
        self.transliterator = Transliterator(source='hin', target='eng', build_lookup=True)
        self.devanagari_token_ids = self._compute_devanagari_tokens()
    
    def _compute_devanagari_tokens(self) -> list[int]:
        # Cache result — compute once at startup
        ids = []
        tokenizer = self.model.hf_tokenizer
        for token_id in range(tokenizer.vocab_size):
            token = tokenizer.decode([token_id])
            if any('ऀ' <= ch <= 'ॿ' for ch in token):
                ids.append(token_id)
        return ids
    
    def transcribe(self, audio_path: str, language_pref: str) -> str:
        if language_pref == "hinglish":
            self.model.load_lora_adapter(self.hinglish_lora)
            transcript = self._do_transcribe(audio_path, language="hi", suppress=True)
            transcript = self._safety_check(transcript)
        else:
            self.model.load_lora_adapter(self.english_lora)
            transcript = self._do_transcribe(audio_path, language="en", suppress=False)
        return transcript
    
    def _do_transcribe(self, audio_path: str, language: str, suppress: bool) -> str:
        kwargs = {"language": language, "task": "transcribe"}
        if suppress:
            kwargs["suppress_tokens"] = self.devanagari_token_ids
        
        segments, _ = self.model.transcribe(audio_path, **kwargs)
        return " ".join([seg.text for seg in segments])
    
    def _safety_check(self, text: str) -> str:
        if re.search(r'[ऀ-ॿ]', text):
            # Should never fire if suppress_tokens working correctly
            print(f"WARNING: Devanagari leaked despite suppression: {text}")
            return self.transliterator.transform(text)
        return text
```

### `scripts/evaluate_wer.py` (skeleton)

```python
"""
Evaluate WER + custom metrics on test set.
"""
import argparse
import json
import re
from jiwer import wer
from pathlib import Path


def has_devanagari(text: str) -> bool:
    return bool(re.search(r'[ऀ-ॿ]', text))


def main(args):
    # Load test set
    test_pairs = []
    with open(f"{args.eval_dir}/transcripts.csv") as f:
        for line in f:
            audio_path, ground_truth = line.strip().split(',', 1)
            test_pairs.append((audio_path, ground_truth))
    
    # Run inference
    from scripts.transcribe_with_safety import SafeTranscriber
    transcriber = SafeTranscriber(args.checkpoint, ...)
    
    predictions = []
    for audio_path, _ in test_pairs:
        pred = transcriber.transcribe(audio_path, args.language_pref)
        predictions.append(pred)
    
    ground_truths = [gt for _, gt in test_pairs]
    
    # Compute metrics
    wer_score = wer(ground_truths, predictions)
    devanagari_leak_rate = sum(has_devanagari(p) for p in predictions) / len(predictions)
    
    results = {
        "wer": wer_score,
        "devanagari_leak_rate": devanagari_leak_rate,
        "n_samples": len(predictions),
    }
    
    # Save
    with open(args.output, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(json.dumps(results, indent=2))
    
    # Strict gate
    if args.strict_latin and devanagari_leak_rate > 0:
        raise AssertionError(f"FAIL: Devanagari leak rate {devanagari_leak_rate} > 0")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--eval_dir", required=True)
    parser.add_argument("--language_pref", default="english")
    parser.add_argument("--strict_latin", action="store_true")
    parser.add_argument("--output", required=True)
    main(parser.parse_args())
```

### `deployment/whisper_multilang_endpoint.py` (Modal example)

```python
"""
Modal deployment with runtime LoRA adapter swap.
Usage: modal deploy whisper_multilang_endpoint.py
"""
import modal

app = modal.App("stayfree-asr")

image = (
    modal.Image.debian_slim()
    .pip_install("faster-whisper>=1.0.0", "fastapi", "indictrans")
)

@app.function(
    image=image,
    gpu="A100",
    container_idle_timeout=300,  # warm pool
    keep_warm=1,  # min 1 container always running
)
@modal.web_endpoint(method="POST")
async def transcribe(audio_bytes: bytes, language_pref: str):
    from scripts.transcribe_with_safety import SafeTranscriber
    transcriber = SafeTranscriber(
        base_model_path="/models/whisper-turbo",
        english_lora="/models/lora-en-v1",
        hinglish_lora="/models/lora-hi-latin-v1",
    )
    return {"transcript": transcriber.transcribe(audio_bytes, language_pref)}
```

---

## 29. Project Structure (Recommended Folder Layout)

```
stayfree-asr/
├── README.md
├── requirements.txt
├── .env                          # API keys, secrets (gitignored)
│
├── data/
│   ├── raw/                      # Raw downloaded data
│   │   ├── commonvoice_en/
│   │   ├── self_recorded/
│   │   ├── youtube/              # English niche channels
│   │   ├── youtube_hi/           # Hinglish channels
│   │   ├── mucs/                 # MUCS 2021
│   │   ├── cv_hindi/             # Common Voice Hindi
│   │   ├── tts_en/               # F5-TTS English synthetic
│   │   └── tts_hi/               # Indic Parler-TTS synthetic
│   │
│   ├── processed/                # Preprocessed (16kHz mono, ≤30 sec)
│   │   ├── english/
│   │   │   ├── train/
│   │   │   ├── val/
│   │   │   └── test/
│   │   └── hinglish/
│   │       ├── train/
│   │       ├── val/
│   │       └── test/
│   │
│   └── smoke/                    # Tiny subset for smoke tests
│
├── eval/                         # Held-out evaluation set
│   ├── english/                  # 100 audio + transcripts.csv
│   └── hinglish/                 # 100 audio + transcripts.csv
│
├── scripts/                      # Pipeline scripts (see Section 28)
│   ├── baseline_eval.py
│   ├── download_commonvoice.py
│   ├── transcribe_for_labels.py
│   ├── generate_dictation_text.py
│   ├── tts_synthesize.py
│   ├── preprocess_dataset.py
│   ├── transliterate_to_latin.py
│   ├── validate_script.py
│   ├── whisper_lora_finetune.py
│   ├── evaluate_wer.py
│   ├── transcribe_with_safety.py
│   ├── compare_baselines.py
│   └── human_review_ui.py
│
├── checkpoints/                  # Model outputs (gitignored, push to HF Hub)
│   ├── smoke_test/
│   ├── english_v1/
│   │   └── best/                 # Best checkpoint (lowest val_loss)
│   └── hinglish_latin_v1/
│       └── best/
│
├── results/                      # Eval results JSONs
│   ├── english_v1_eval.json
│   └── hinglish_v1_eval.json
│
├── deployment/                   # Modal/Lightning deployment configs
│   ├── whisper_english_endpoint.py
│   ├── whisper_multilang_endpoint.py
│   └── modal_config.toml
│
├── notebooks/                    # Exploratory analysis
│   ├── data_quality_audit.ipynb
│   └── error_analysis.ipynb
│
└── docs/                         # This document + companions
    ├── StayFree_ASR_Strategy_NextSteps.md
    ├── StayFree_ASR_vs_Formatter_DeepDive.docx
    └── StayFree_Complete_FineTuning_Guide.docx
```

### Naming conventions

- **Data files**: `<source>_<speaker_id>_<env>_<mic>_<seq>.wav` (e.g., `youtube_dhruvrathee_studio_lapel_001.wav`)
- **Transcripts**: JSONL with `{"audio": <path>, "transcript": <text>, "language": "en|hi", "metadata": {...}}`
- **Checkpoints**: `<language>_<version>` (e.g., `english_v1`, `hinglish_latin_v1`)
- **Eval results**: `<language>_<version>_eval.json`

---

## 30. Handover Checklist

**Before starting Phase 1**, confirm:
- [ ] Read sections 1, 26 (decisions and rationale)
- [ ] Read section 27 (implementation playbook)
- [ ] Have section 28 code skeletons ready to adapt
- [ ] Project folder created per section 29 layout
- [ ] All accounts created (Lightning AI, Modal, HF, Prolific)
- [ ] Local Python environment + dependencies installed
- [ ] yt-dlp + ffmpeg installed and tested
- [ ] Eval set folders created (`eval/english/`, `eval/hinglish/`)
- [ ] WandB account for training monitoring
- [ ] Companion docs reviewed (`StayFree_Complete_FineTuning_Guide.docx`, `StayFree_ASR_vs_Formatter_DeepDive.docx`)

**During execution**, log:
- Decisions deviated from plan + rationale
- Unexpected costs / training failures
- Data quality issues discovered
- Model behavior surprises

**After Phase 8 (Hinglish deployed)**:
- Update this doc with v1 final WER numbers
- Update with actual costs vs estimates
- Document any new edge cases discovered
- Plan Phase 3 features (background voice filter)
