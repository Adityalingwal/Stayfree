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
    private let settingsWindowController = SettingsWindowController()
    private let onboardingWindowController = OnboardingWindowController()
    private let permissionService: PermissionService

    init() {
        let settings = Settings()
        let appVM = AppViewModel(settings: settings)

        // Services
        let hotkeyService = HotkeyService()
        let audioService = AudioService()
        let permissionService = PermissionService()
        self.permissionService = permissionService
        let sarvamKey: String? = {
            if let env = ProcessInfo.processInfo.environment["SARVAM_API_KEY"], !env.isEmpty { return env }
            if let plist = Bundle.main.object(forInfoDictionaryKey: "SARVAM_API_KEY") as? String, !plist.isEmpty { return plist }
            return nil
        }()
        let transcriptionRouter = TranscriptionRouter(settings: settings, groqAPIKey: APIKeys.groq, sarvamAPIKey: sarvamKey)
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
        appVM.sarvamService = transcriptionRouter.sarvamService

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

        // Warm Sarvam connection if Hindi mode
        if settings.language == .hindi, let sarvam = transcriptionRouter.sarvamService {
            Task {
                do {
                    try await sarvam.connect()
                    print("[App] Sarvam keep-warm connection established")
                } catch {
                    print("[App] Sarvam keep-warm failed (will retry on first use): \(error.localizedDescription)")
                }
            }
        }

        // Show onboarding on first launch
        if !settings.onboardingComplete {
            onboardingWindowController.show(
                settings: settings,
                permissionService: permissionService,
                onComplete: { [hotkeyService, permissionService] in
                    // Start hotkey after onboarding grants accessibility
                    if permissionService.checkAccessibility() {
                        hotkeyService.start()
                        print("[App] Hotkey listener started after onboarding")
                    }
                }
            )
        }

        print("[App] MRMUR initialized — language: \(settings.language.rawValue)")
    }

    var body: some Scene {
        MenuBarExtra("MRMUR", systemImage: "mic.fill") {
            MenuBarView(onOpenSettings: { [settingsWindowController, appVM, settings] in
                settingsWindowController.show(appVM: appVM, settings: settings)
            })
            .environment(appVM)
            .environment(settings)
        }
        .menuBarExtraStyle(.menu)
    }
}
