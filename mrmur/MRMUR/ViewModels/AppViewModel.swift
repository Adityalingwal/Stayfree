import AppKit

/// Top-level app state coordinator.
/// Wires hotkey callbacks to pipeline, manages app-wide state.
/// Phase 2: Added transcription + formatting (console output only, paste in Phase 3).
@Observable
final class AppViewModel {
    private(set) var state: AppState = .idle
    private(set) var activeRecordingSource: RecordingSource?
    private(set) var lastError: WidgetError?

    let settings: Settings
    var hotkeyService: (any HotkeyServiceProtocol)?
    var audioService: (any AudioServiceProtocol)?
    var permissionService: (any PermissionServiceProtocol)?
    var transcriptionService: (any TranscriptionServiceProtocol)?
    var formattingService: (any FormattingServiceProtocol)?
    var pasteService: (any PasteServiceProtocol)?

    /// Guard against concurrent pipeline runs (matches Electron isProcessing pattern).
    private var isProcessing = false

    init(settings: Settings) {
        self.settings = settings
    }

    // MARK: - Hotkey Callbacks

    func handleRecordingStart() {
        guard state == .idle, !isProcessing else { return }
        state = .recording
        activeRecordingSource = .hotkey
        lastError = nil

        do {
            try audioService?.startCapture(hindiMode: settings.language == .hindi)
            print("[AppVM] Recording started (hotkey)")
        } catch {
            print("[AppVM] Failed to start capture: \(error)")
            resetState()
        }
    }

    func handleRecordingStop() {
        guard state == .recording, activeRecordingSource == .hotkey else { return }
        let audioData = audioService?.stopCapture() ?? Data()
        print("[AppVM] Recording stopped — \(audioData.count) bytes captured")
        executePipeline(audioData: audioData)
    }

    // MARK: - Widget Recording (click mode)

    func startWidgetRecording() {
        guard state == .idle, !isProcessing else { return }
        state = .recording
        activeRecordingSource = .widget
        lastError = nil

        do {
            try audioService?.startCapture(hindiMode: settings.language == .hindi)
            print("[AppVM] Recording started (widget)")
        } catch {
            print("[AppVM] Failed to start capture: \(error)")
            resetState()
        }
    }

    func stopWidgetRecording() {
        guard state == .recording, activeRecordingSource == .widget else { return }
        let audioData = audioService?.stopCapture() ?? Data()
        print("[AppVM] Widget recording stopped — \(audioData.count) bytes")
        executePipeline(audioData: audioData)
    }

    func cancelRecording() {
        guard state == .recording else { return }
        audioService?.cancelCapture()
        resetState()
        print("[AppVM] Recording cancelled")
    }

    // MARK: - Pipeline (Phase 2: transcribe + format, Phase 3: + paste)

    private func executePipeline(audioData: Data) {
        guard !audioData.isEmpty else {
            showError(PipelineError.noAudio)
            return
        }
        guard !isProcessing else { return }

        state = .processing
        isProcessing = true

        Task { @MainActor in
            defer {
                isProcessing = false
                resetState()
            }

            do {
                // Step 1: Transcribe (5s timeout)
                guard let transcriptionService else {
                    throw PipelineError.transcriptionFailed("Transcription service not configured")
                }
                let rawText = try await withThrowingTimeout(seconds: 5) {
                    try await transcriptionService.transcribe(audio: audioData)
                }
                print("[Pipeline] Raw: \"\(rawText)\"")

                // Step 2: Format (3s timeout)
                guard let formattingService else {
                    // No formatter — use raw text
                    print("[Pipeline] No formatter — using raw text")
                    print("[Pipeline] RESULT: \"\(rawText)\"")
                    return
                }
                let formatted = try await withThrowingTimeout(seconds: 3) {
                    try await formattingService.format(rawText)
                }
                print("[Pipeline] Formatted: \"\(formatted)\"")

                // Step 3: Paste (1s timeout)
                let textToPaste = formatted
                guard let pasteService else {
                    print("[Pipeline] No paste service — copying to clipboard")
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(textToPaste, forType: .string)
                    return
                }

                let pasted = try await withThrowingTimeout(seconds: 1) {
                    pasteService.paste(textToPaste)
                }

                if pasted {
                    print("[Pipeline] Pasted: \"\(textToPaste)\"")
                } else {
                    // Paste failed — fall back to clipboard so user doesn't lose text
                    print("[Pipeline] Paste failed — text copied to clipboard")
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(textToPaste, forType: .string)
                }

            } catch is CancellationError {
                print("[Pipeline] Cancelled")
            } catch let error as PipelineError {
                showError(error)
            } catch {
                showError(PipelineError.transcriptionFailed(error.localizedDescription))
            }
        }
    }

    // MARK: - Error Handling

    private func showError(_ error: PipelineError) {
        print("[Pipeline] Error: \(error.localizedDescription)")
        lastError = error.widgetError

        // Auto-dismiss after 2 seconds
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            if lastError?.message == error.localizedDescription {
                lastError = nil
            }
        }
    }

    // MARK: - State

    func resetState() {
        state = .idle
        activeRecordingSource = nil
    }
}

// MARK: - Timeout helper (per-step timeouts as decided in review)

func withThrowingTimeout<T: Sendable>(
    seconds: TimeInterval,
    operation: @escaping @Sendable () async throws -> T
) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask {
            try await operation()
        }
        group.addTask {
            try await Task.sleep(for: .seconds(seconds))
            throw PipelineError.streamTimeout
        }
        // Whichever finishes first wins
        guard let result = try await group.next() else {
            throw PipelineError.streamTimeout
        }
        group.cancelAll()
        return result
    }
}
