import SwiftUI

/// MRMUR — Native macOS voice dictation app.
/// Menu bar tray app (LSUIElement = YES, no dock icon).
/// Hold Left Option → record → release → transcribe → format → paste.
@main
struct MRMURApp: App {
    @State private var appVM: AppViewModel
    @State private var settings: Settings
    private let widgetWindow: FloatingWidgetWindow
    private let soundService: SoundService

    init() {
        let settings = Settings()
        let appVM = AppViewModel(settings: settings)

        // Services
        let hotkeyService = HotkeyService()
        let audioService = AudioService()
        let permissionService = PermissionService()
        let transcriptionRouter = TranscriptionRouter(settings: settings, groqAPIKey: APIKeys.groq)
        let formattingService = FormattingService(settings: settings, groqAPIKey: APIKeys.groq)
        let pasteService = PasteService()
        let soundService = SoundService(isEnabled: { [weak settings] in settings?.soundEnabled ?? true })

        // Wire hotkey callbacks → AppViewModel (minimal callback, async dispatch inside)
        hotkeyService.onRecordingStart = { [weak appVM, weak soundService] in
            soundService?.playStartChime()
            appVM?.handleRecordingStart()
        }
        hotkeyService.onRecordingStop = { [weak appVM, weak soundService] in
            soundService?.playStopChime()
            appVM?.handleRecordingStop()
        }

        // Inject services
        appVM.hotkeyService = hotkeyService
        appVM.audioService = audioService
        appVM.permissionService = permissionService
        appVM.transcriptionService = transcriptionRouter
        appVM.formattingService = formattingService
        appVM.pasteService = pasteService

        // Store as @State
        _appVM = State(initialValue: appVM)
        _settings = State(initialValue: settings)
        self.soundService = soundService

        // Create floating widget window
        let widget = FloatingWidgetWindow()
        let hostView = NSHostingView(
            rootView: FloatingWidgetView()
                .environment(appVM)
                .environment(settings)
        )
        widget.contentView = hostView
        widget.orderFront(nil)
        self.widgetWindow = widget

        // Observe app state to resize widget
        appVM.onStateChange = { [weak widget] newState, source in
            guard let widget else { return }
            switch newState {
            case .idle:
                widget.updateLayout(.idle)
            case .recording:
                widget.updateLayout(.recording)
            case .processing:
                widget.updateLayout(.processing)
            }
        }

        // Start hotkey listener if accessibility granted
        if permissionService.checkAccessibility() {
            hotkeyService.start()
            print("[App] Hotkey listener started")
        } else {
            print("[App] Accessibility not granted — hotkey disabled")
        }

        print("[App] MRMUR initialized — language: \(settings.language.rawValue)")
    }

    var body: some Scene {
        MenuBarExtra("MRMUR", systemImage: "mic.fill") {
            MenuBarView()
                .environment(appVM)
                .environment(settings)
        }
        .menuBarExtraStyle(.menu)
    }
}
