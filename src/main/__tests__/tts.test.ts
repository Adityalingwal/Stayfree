import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process
const mockKill = vi.fn();
vi.mock("child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], callback: (err: Error | null) => void) => {
    // Simulate async completion
    setTimeout(() => callback(null), 0);
    return { kill: mockKill };
  }),
}));

import { speak, stopSpeaking, isSpeaking } from "../tts";
import { execFile } from "child_process";

beforeEach(() => {
  vi.clearAllMocks();
  // Reset internal state by stopping any active process
  stopSpeaking();
});

describe("speak", () => {
  it("calls say with correct default args", async () => {
    await speak("hello world");
    expect(execFile).toHaveBeenCalledWith(
      "say",
      ["-v", "Samantha", "-r", "200", "hello world"],
      expect.any(Function),
    );
  });

  it("uses custom voice when specified", async () => {
    await speak("test", "Alex");
    expect(execFile).toHaveBeenCalledWith(
      "say",
      ["-v", "Alex", "-r", "200", "test"],
      expect.any(Function),
    );
  });

  it("resolves on completion", async () => {
    await expect(speak("done")).resolves.toBeUndefined();
  });

  it("resolves even on error", async () => {
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_cmd: string, _args: string[], callback: (err: Error | null) => void) => {
        setTimeout(() => callback(new Error("voice not found")), 0);
        return { kill: mockKill };
      },
    );
    await expect(speak("fail")).resolves.toBeUndefined();
  });
});

describe("stopSpeaking", () => {
  it("kills active process", () => {
    // Trigger a speak that doesn't complete immediately
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        return { kill: mockKill };
      },
    );
    speak("long text");
    stopSpeaking();
    expect(mockKill).toHaveBeenCalled();
  });

  it("does not throw when no active process", () => {
    expect(() => stopSpeaking()).not.toThrow();
  });
});

describe("isSpeaking", () => {
  it("returns false when idle", () => {
    expect(isSpeaking()).toBe(false);
  });

  it("returns true during speech", () => {
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        return { kill: mockKill };
      },
    );
    speak("active");
    expect(isSpeaking()).toBe(true);
  });

  it("returns false after stop", () => {
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        return { kill: mockKill };
      },
    );
    speak("test");
    stopSpeaking();
    expect(isSpeaking()).toBe(false);
  });
});
