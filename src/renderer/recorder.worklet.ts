// @ts-nocheck
/**
 * AudioWorkletProcessor — PCM16 streaming for Sarvam Hindi path
 *
 * Runs on the audio thread. Downsamples mic input to 16kHz PCM16 and
 * posts ~100ms chunks to the main thread via MessagePort.
 *
 * Loaded via AudioWorklet.addModule(). NOT bundled by webpack — loaded
 * as a raw script URL.
 */

const TARGET_SAMPLE_RATE = 16000;
const CHUNK_DURATION_S = 0.1; // 100ms chunks

class PCM16Processor extends AudioWorkletProcessor {
  private inputSampleRate: number;
  private samplesPerChunk: number;
  private buffer: Float32Array;
  private bufferIndex: number;
  private active: boolean;

  constructor() {
    super();
    // sampleRate is a global in AudioWorkletGlobalScope
    this.inputSampleRate = sampleRate;
    this.samplesPerChunk = Math.round(TARGET_SAMPLE_RATE * CHUNK_DURATION_S);
    this.buffer = new Float32Array(this.samplesPerChunk);
    this.bufferIndex = 0;
    this.active = true;

    this.port.onmessage = (e) => {
      if (e.data === "stop") {
        this.active = false;
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    if (!this.active) return false;

    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputChannel = input[0]; // mono channel

    // Downsample from inputSampleRate to TARGET_SAMPLE_RATE
    const ratio = this.inputSampleRate / TARGET_SAMPLE_RATE;

    for (let i = 0; i < inputChannel.length; i++) {
      const srcIndex = Math.round(i * ratio);
      if (srcIndex >= inputChannel.length) break;

      // Write downsampled sample into buffer
      this.buffer[this.bufferIndex++] = inputChannel[Math.floor(i / ratio)];

      if (this.bufferIndex >= this.samplesPerChunk) {
        // Convert Float32 → PCM16 Int16Array
        const pcm16 = new Int16Array(this.samplesPerChunk);
        for (let j = 0; j < this.samplesPerChunk; j++) {
          const s = Math.max(-1, Math.min(1, this.buffer[j]));
          pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Transfer buffer to main thread (zero-copy)
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm16-processor", PCM16Processor);
