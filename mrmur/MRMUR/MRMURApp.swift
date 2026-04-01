import SwiftUI

/// MRMUR — Native macOS voice dictation app.
/// Menu bar tray app (LSUIElement = YES, no dock icon).
/// Hold Left Option → record → release → transcribe → format → paste.
@main
struct MRMURApp: App {
    @State private var appVM: AppViewModel
    @State private var settings: Settings

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

        // Wire hotkey callbacks → AppViewModel (minimal callback, async dispatch inside)
        hotkeyService.onRecordingStart = { [weak appVM] in
            appVM?.handleRecordingStart()
        }
        hotkeyService.onRecordingStop = { [weak appVM] in
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
