import SwiftUI

/// MRMUR — Native macOS voice dictation app.
/// Menu bar tray app (LSUIElement = YES, no dock icon).
/// Hold Left Option → record → release → transcribe → format → paste.
@main
struct MRMURApp: App {
    @State private var appVM: AppViewModel
    @State private var settings: Settings
    @State private var hotkeyService: HotkeyService
    @State private var audioService: AudioService
    @State private var permissionService: PermissionService

    init() {
        let settings = Settings()
        let appVM = AppViewModel(settings: settings)
        let hotkeyService = HotkeyService()
        let audioService = AudioService()
        let permissionService = PermissionService()

        // Wire hotkey callbacks to AppViewModel
        hotkeyService.onRecordingStart = { [weak appVM] in
            appVM?.handleRecordingStart()
        }
        hotkeyService.onRecordingStop = { [weak appVM] in
            appVM?.handleRecordingStop()
        }

        // Inject services into AppViewModel
        appVM.hotkeyService = hotkeyService
        appVM.audioService = audioService
        appVM.permissionService = permissionService

        // Store as @State
        _appVM = State(initialValue: appVM)
        _settings = State(initialValue: settings)
        _hotkeyService = State(initialValue: hotkeyService)
        _audioService = State(initialValue: audioService)
        _permissionService = State(initialValue: permissionService)

        // Start hotkey listener if permissions are granted
        if permissionService.checkAccessibility() {
            hotkeyService.start()
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
