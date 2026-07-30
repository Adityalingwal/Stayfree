# Local-First STT — Master Document (Research + Testing + Roadmap)

> **Last updated:** 2026-07-29
> **Status:** Research + testing round COMPLETE. Winner chosen. Next phase: app integration + streaming, then fine-tuning iterations.
> **Purpose:** Is file se koi bhi nayi session exactly wahi se continue kar sakti hai jahan hum ruke the. Sab kuch isme hai — research, tests, results, decisions, aage ka plan.

---

## 1. Goal (kya banana hai)

StayFree (macOS Electron dictation app) abhi **cloud Sarvam Saaras v3** API use karta hai Hindi/Hinglish ke liye. Goal: **API hatakar local-first** banana —

- Model **device pe locally** chale (low-end PCs tak, aur Apple Silicon pe to pakka)
- Output **Roman Hinglish** ("kal meeting hai, main aa jaunga") — Devanagari nahi
- Latency: transcript **1-2 second** mein (500ms ideal), streaming ho to best
- Storage discipline: kam disk, cache cleanup, users ka system hang na ho

---

## 2. Deep Research Findings (July 2026, 4 parallel agents + manual verification)

### Winner-relevant conclusions

| Model | Verdict |
|---|---|
| **Oriserve Whisper-Hindi2Hinglish family** (Apache-2.0) | ✅ **CHOSEN** — Whisper fine-tunes jo seedha Roman Hinglish output dete hain. 3 variants: **Swift** (whisper-base, 72.6M params), **Apex** (turbo-class ~0.8B), **Prime** (large-v3, 1.55B). ~550 hrs noisy Indian-accent Hindi pe trained |
| NVIDIA **Nemotron 3.5 ASR Streaming 0.6B** (June 2026 release) | 🔮 Future streaming candidate — cache-aware streaming, 40 languages incl. Hindi, 600M. **Blocker:** sherpa-onnx sirf English variant support karta hai; multilingual = open feature request (k2-fsa/sherpa-onnx#3664) |
| AI4Bharat IndicConformer + IndicXlit | ❌ **DITCHED by Aditya** — Codex pe khud test kiya, effective nahi laga. Dobara suggest mat karna. (Technical blockers bhi the: HF-gated repos, IndicXlit py3.12 pe uninstallable) |
| vasista22/whisper-hindi-large-v2 | ❌ Best raw WER (6.80 Fleurs) but 1.5B chunk-only — low-end pe impossible |
| NVIDIA Parakeet (all versions) | ❌ **Hindi support hi nahi** (25 European langs only) — verified |
| Moonshine, Kyutai STT, IBM Granite, Qwen-Audio, Google Chirp, distil-whisper | ❌ No Hindi / not open |
| Sarvam ke apne models | ❌ Saaras ASR kabhi open-source nahi hua (API-only); unke sirf text LLMs open hain |

### Market scan (~15 OSS dictation apps dekhe)

- **Handy** (27.7k⭐, Tauri+Rust, Parakeet via transcribe-rs) — wahi "Parakeet wala" app jo Aditya ko yaad tha
- **OpenWhispr** (4.9k⭐, **Electron** — humara architecture blueprint, neeche §5)
- FluidVoice (9k⭐ Swift), VoiceInk (5.7k⭐), Vibe (6.9k⭐), Whispering, OpenSuperWhisper, VoxType, hyprwhspr, dictee, FUTO...
- **Koi bhi app local Hindi/Hinglish nahi karta — genuine market white-space**
- Benchmark to beat: Wispr Flow (cloud) ~1.8s latency; MacWhisper (naive local Whisper) 2.4s — proof ki naive local approach cloud se bhi slow hota hai

### Key technical walls (research se)

1. **Whisper 30s-padding**: har clip ~30s window ki cost — isliye streaming/chunking architecture zaroori for long audio
2. **Hindi floor English se ooncha**: tiny/base stock models Hindi ke liye inadequate documented — but Oriserve ka Hinglish fine-tune base ko usable bana deta hai
3. Old non-AVX2 CPUs (pre-2013) pe Whisper-family genuinely unusable — CTC-family models hi wahan chance rakhte hain (future problem, abhi nahi)
4. INT8 quantization ~free hai (2-4x speed, negligible quality loss) — **humne khud verify kiya (Test 4)**

---

## 3. Testing Round (2026-07-29, sab background agents Sonnet 5 pe)

**Test set:** Aditya ki apni **82 real dictation recordings** (`~/Library/Application Support/StayFree/recordings/*.webm`, 0.3-16.7s), jisme se **50 ke Sarvam transcripts** history mein paired mile (`config.json` → `transcriptionHistory[].audioFilePath` + `rawText`). WebM → 16kHz mono WAV converted. **Note: WER-vs-Sarvam = "Sarvam se disagreement", absolute accuracy nahi** — Sarvam khud noisy reference hai (ek clip mein Sarvam ka transcript truncated mila, local model ne poora sahi kiya).

### Test 1 — Oriserve Swift baseline (transformers fp32 CPU) ✅

- **Latency:** median **0.57s**, max 1.18s, median RTF 0.089 (~10x realtime on M3 CPU)
- **WER vs Sarvam:** mean 0.342 / median 0.319 — **but bada hissa Roman-spelling variance hai** (rehne/rahne, toh/to), asli errors kam
- Lambi saaf clips (8-15s): WER 0.08-0.19 — almost Sarvam-level
- **Kamzori:** chhoti clips (<3s) + English jargon — "puppeteer"→"PPP", "agent"→"again", "mosaic"→garble, "despair"→"dust wear", "Dev Mem"→"deaf ma'am" (ye 5 = standard jargon fail-case set)
- Zero hallucination, zero Devanagari leak, zero empty outputs

### Test 2 — Jargon text-tricks (prompt biasing + dictionary correction) ❌ FAILED

- 5 fail-cases mein se sirf 2 fixed; prompt biasing ne 2 achhi clips kharab ki ("stay free"→"step 3"); dictionary: 4 fixes vs 6 regressions (plural collisions)
- Aggregate WER unchanged (~0.34)
- **Seekh (permanent):** jargon errors **acoustic level** pe hote hain — model ne galat suna to text-level correction unreliable. Behtar model/training chahiye. **Ye tricks dobara try mat karna.**

### Test 3 — Prime (large-v3, 1.55B) 🚫 CANCELED

- Download hua (5.8GB) but **Aditya ka laptop overheat** hone laga → test cancel, model delete
- Seekh: 1.5B fp32 CPU pe is machine ke liye no-go; Prime waise bhi shipping candidate nahi tha (quality benchmark only)
- **Heat rule ban gaya:** har future test se pehle heat-rating batana; chhote models sequential = safe

### Test 4 — Swift on whisper.cpp + Metal + quantization ✅✅ BIG WIN

- HF→ggml conversion successful; **q8_0 recommended** (q5_1 ek jargon clip pe thoda worse, size gain negligible)
- **Latency: cold 0.23s median (measured, 2.5x faster), warm decode-only ~0.13s median (estimate)**
- Metal saare runs mein engaged, no CPU fallback → **kam heat**
- WER vs Sarvam: 0.337 — **quantization se zero meaningful loss (verified)**
- **Production engine LOCKED: whisper.cpp + q8_0 + Metal**

### Test 5 — IndicConformer + transliteration ⚠️ MIXED → path ditched

- Intended components dono blocked (HF-gated official repos; IndicXlit install rot) → fallback: community 600M INT8 ONNX + Aksharamukha
- **Latency best thi: 0.16s median.** ASR ne jargon **behtar SUNA** (background agent + mosaic clearly fixed, puppeteer partial = 2.5/5 vs Swift 0/5)
- **But romanization mechanical garbage** ("kara", "eka", "baikagraunda") → WER 0.743, 48/50 clips Swift se haara
- **Aditya ne AI4Bharat path DITCH kiya** (Codex pe bhi test karke dekha tha — not effective). Closed.

### 🏆 FINAL WINNER

**Oriserve Whisper-Hindi2Hinglish-Swift + whisper.cpp q8_0 + Metal**
= ~0.13-0.23s latency, WER-vs-Sarvam ~0.34 (asli usability behtar), natural Hinglish spelling, single-step, ~80MB shipping model, kam heat. Known open weakness: English jargon + short clips (fine-tuning se fix hoga, §7).

---

## 4. Kept assets on disk

`~/stt-testing/` (366MB total — **delete mat karna**, integration + future benchmarks ke liye):
- `ggml-models/` (276MB) — converted Swift: fp16 + **q8_0 (shipping artifact)** + q5_1
- `whisper.cpp/` (74MB) — Metal-enabled build (whisper-cli, whisper-quantize binaries)
- `wav/` (16MB) — **82-clip test set (gold — har future model/iteration isi pe judge hoga)**
- `pairs.json` — clip ↔ Sarvam reference mapping
- `results/` — swift-results.json + saare analyses
- Scripts: transcribe.py, analyze.py, run_whispercpp.py, etc. (venvs delete ho chuke — dobara banana padega jab chahiye)

Cleanup already done: venvs (3.3GB), HF caches, NeMo, pip cache (638MB) — sab deleted. System HF cache (83M) pre-existing untouched. Repo git state untouched.

---

## 5. Architecture Plan (integration phase — NEXT UP)

**Blueprint = OpenWhispr ka proven design** (unka engineering blog: openwhispr.com/blog/local-streaming-speech-to-text):

```
AudioWorklet (renderer, 16kHz PCM)
   → local WebSocket (127.0.0.1)
   → sidecar native process (whisper.cpp, q8_0, Metal)
   → transcript → paste
```

Key decisions:
1. **Sidecar process** (main process mein embed nahi) — crash isolation; current Sarvam WS code ka shape almost same hai, transport target badlega bas (api.sarvam.ai → localhost)
2. **Streaming = transcribe-while-recording**: chunks recording ke दौरान process; hotkey release pe sirf tail bachta hai → perceived latency ~0.2-0.4s **chahe audio 10s ho ya 2 min**. (Bina streaming projections: 30s audio ≈ 0.4-0.7s, 60s ≈ 0.8-1.5s — estimates, measured nahi)
3. **Single-pass streaming = authoritative transcript**, error pe fallback full re-transcribe (OpenWhispr evolution copy karo)
4. **Model warm rakhna** app start pe (~400MB RAM class); idle-unload option
5. **Sarvam cloud = fallback** jab tak local proven; settings toggle
6. silero-vad (2MB) silence trim ke liye; greedy decoding default
7. Model download-on-first-run pattern (installer mein bundle nahi)
8. Electron native module packaging pe dhyan (webpack externals — jaise uiohook-napi/ws already hain)

---

## 6. Data Strategy (Aditya ka domain — usne own kiya hai)

- **Pseudo-labeling = core trick:** audio → Sarvam API (₹30/hr) → transcript = training pair. 500 hrs labeled data ≈ sirf ₹15k (human labeling ₹5-10 lakh hota)
- **App khud data-factory hai:** har dictation audio+transcript save karta hai (85+ clips already)
- **YouTube audio** — Aditya khud extract karega, legality uski taraf se no-issue, sirf audio chahiye
- **Quality filter zaroori** (Aditya ne commit kiya): VAD + confidence-based filtering, music/multi-speaker kachra bahar
- **Augmentation:** volume/pitch/speed/background-noise mixing → 50 hrs asli → 200-300 hrs effective, free
- **Whisper-voice (fusfusahat): GOAL NAHI HAI** — Aditya ne explicitly drop kiya. Pitch/volume augmentation se whisper nahi banta (alag acoustics), aur humein chahiye bhi nahi
- **Domains: technical/tech + rozmarra app usage.** Medical/other fields NAHI (high-stakes, alag product category)

---

## 7. Fine-tuning Plan (accuracy improvement roadmap)

### Path A — ABHI: Oriserve Swift weights se aage fine-tune
- Unki 550-hr Hinglish foundation free milti hai; hum sirf jargon/domain patch karte hain
- **Pehle PILOT RUN (₹0-1000):** 5-10 hrs jargon-rich data → LoRA fine-tune on Colab free T4 → 82-clip set + 5 jargon fail-cases pe evaluate. Model seekh raha hai ya nahi — ye sasta proof pehle
- Phir scale: 20-50 hrs tech-domain data, mix **~75% general Hinglish + ~25% jargon-rich** (catastrophic forgetting se bachne ke liye — sirf jargon pe train kiya to general Hindi bhoolega)
- Compute: **M3 pe NAHI** (slow + heat). Cloud: Colab free/Pro, rented 4090 ₹30-50/hr, full run ₹500-2000, poora starter budget ₹2-10k
- Fine-tuning se **size nahi badalta** — 72.6M params, q8 ~80MB hi rahega
- Expectations: jargon cases 0/5 → 3-4/5 (bada felt improvement); overall WER 0.34 → ~0.27-0.30 (moderate)
- Saturation ka dar unfounded: stock base Hindi mein useless tha → Oriserve ne usi architecture ko 550 hrs se transform kiya = headroom proven. Jargon = 2-5k words, chhota patch. Whisper-base ne pretraining (680k hrs) mein English tech words sune hue hain — hum dabi pehchan wapas jaga rahe hain

### Path B — BAAD MEIN (premium tier): whisper-small (244M) ka apna Hinglish fine-tune
- Jab data pipeline mature ho (few hundred hrs collected) — kyunki small ka koi Oriserve version nahi hai, poori Hinglish adaptation khud karni padegi
- q8 pe ~250MB → "accuracy mode" for modern systems. Medium (769M) skip — cost/benefit nahi banta

---

## 8. Session constraints & working style (Aditya-specific — har session mein respect karo)

- **Hinglish mein baat** (global rule), short/concise, ek-ek karke, beginner-friendly, no filler
- **Background agents Sonnet 5 pe** (iss project ki testing/implementation ke liye Aditya ka chosen default — har handoff pe confirm best practice)
- **Heat-sensitive machine:** Apple M3, 8GB RAM — bade models fp32 CPU pe NO (Prime incident). Har test ka heat-rating pehle batao
- **Storage discipline:** sab kuch ek folder mein, HF_HOME scoped, cache cleanup after, disk before/after report
- **User git khud handle karta hai — commit mat karna**
- Agents: findings scratchpad MD files mein, return = path + 2-3 lines; foreground long-downloads (background-wait pattern stall karta hai; HF xet disable karo: `HF_HUB_DISABLE_XET=1`)

---

## 9. NEXT STEPS (yahan se continue karo)

1. **[NEXT] App integration:** whisper.cpp sidecar + local WS + Sarvam fallback toggle (§5 architecture). Pehle simple record→transcribe, streaming baad mein layer karo
2. **Streaming layer:** chunked transcribe-while-recording (perceived ~0.2-0.4s any length)
3. **Data collection shuru** (parallel): app usage se pairs accumulate + YouTube pipeline + quality filter
4. **Pilot fine-tune run** (₹0-1000, Colab) — jargon learnability proof
5. **Scale fine-tune** Path A → evaluate on 82-clip set → ship improved weights
6. (Future) Path B small model premium tier; Nemotron 3.5 streaming jab sherpa-onnx multilingual support aaye; low-end Windows tier (non-AVX2 wall)

---

## 10. Reference — detailed reports

Deep-research + test reports scratchpad mein the (temporary, shayad ab na ho): research-1..4, test-1/3/4/5 MD files. Unka essence poora is document + memory mein capture hai. Memory files: `~/.claude/projects/-Users-mac-Desktop-StayFree/memory/` → `project_local_first_stt_research.md` (+ MEMORY.md index).
