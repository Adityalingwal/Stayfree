import Foundation

/// Top-level app state coordinator.
/// Wires hotkey callbacks to pipeline, manages app-wide state.
@Observable
final class AppViewModel {
    private(set) var state: AppState = .idle
    private(set) var activeRecordingSource: RecordingSource?

    let settings: Settings
    var hotkeyService: (any HotkeyServiceProtocol)?
    var audioService: (any AudioServiceProtocol)?
    var permissionService: (any PermissionServiceProtocol)?

    init(settings: Settings) {
        self.settings = settings
    }

    // MARK: - Hotkey Callbacks (wired in MRMURApp.init)

    func handleRecordingStart() {
        guard state == .idle else { return }
        state = .recording
        activeRecordingSource = .hotkey

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
        state = .processing

        guard var audio = audioService else {
            resetState()
            return
        }
        let audioData = audio.stopCapture()
        print("[AppVM] Recording stopped — \(audioData.count) bytes captured")

        // Pipeline execution will be wired in Phase 3
        // For now, just log and reset
        if audioData.isEmpty {
            print("[AppVM] No audio data captured")
        }
        resetState()
    }

    // MARK: - Widget Recording (click mode)

    func startWidgetRecording() {
        guard state == .idle else { return }
        state = .recording
        activeRecordingSource = .widget

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
        state = .processing

        guard var audio = audioService else {
            resetState()
            return
        }
        let audioData = audio.stopCapture()
        print("[AppVM] Widget recording stopped — \(audioData.count) bytes")

        // Pipeline wired in Phase 3
        resetState()
    }

    func cancelRecording() {
        guard state == .recording else { return }
        audioService?.cancelCapture()
        resetState()
        print("[AppVM] Recording cancelled")
    }

    // MARK: - State

    func resetState() {
        state = .idle
        activeRecordingSource = nil
    }
}
