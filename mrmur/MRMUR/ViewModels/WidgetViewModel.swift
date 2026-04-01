import Foundation

/// Derives widget UI state from AppViewModel's state + recording source.
/// Manages widget-specific concerns: layout transitions, error display.
@Observable
final class WidgetViewModel {
    private let appVM: AppViewModel

    init(appVM: AppViewModel) {
        self.appVM = appVM
    }

    /// Current widget UI state derived from app state.
    var uiState: WidgetUIState {
        switch appVM.state {
        case .idle:
            return .idle
        case .recording:
            switch appVM.activeRecordingSource {
            case .hotkey: return .recordingHotkey
            case .widget: return .recordingClick
            case .none: return .idle
            }
        case .processing:
            return .processing
        }
    }

    /// Current error to display (if any).
    var error: WidgetError? {
        appVM.lastError
    }

    /// Whether the widget is in a click-recording mode (shows cancel/stop buttons).
    var isClickRecording: Bool {
        uiState == .recordingClick
    }

    // MARK: - Actions (forwarded to AppViewModel)

    func startRecording() {
        appVM.startWidgetRecording()
    }

    func stopRecording() {
        appVM.stopWidgetRecording()
    }

    func cancelRecording() {
        appVM.cancelRecording()
    }
}
