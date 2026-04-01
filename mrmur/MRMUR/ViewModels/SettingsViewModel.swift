import AVFoundation

/// Bindings for the Settings page: language, mic selection, sound toggle.
@Observable
final class SettingsViewModel {
    let settings: Settings

    /// Available audio input devices.
    var microphones: [(id: String, name: String)] = []

    init(settings: Settings) {
        self.settings = settings
        refreshMicrophones()
    }

    // MARK: - Language

    var language: LanguagePreference {
        get { settings.language }
        set { settings.language = newValue }
    }

    // MARK: - Microphone

    var selectedMicId: String {
        get { settings.selectedMicId }
        set { settings.selectedMicId = newValue }
    }

    func refreshMicrophones() {
        let devices = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.microphone],
            mediaType: .audio,
            position: .unspecified
        ).devices

        microphones = devices.map { (id: $0.uniqueID, name: $0.localizedName) }
    }

    // MARK: - Sound

    var soundEnabled: Bool {
        get { settings.soundEnabled }
        set { settings.soundEnabled = newValue }
    }

    // MARK: - Info

    var sttModelName: String {
        language == .english ? "Whisper v3 Turbo" : "Saaras v3"
    }

    var formatterName: String {
        language == .english ? "Llama 3.1 8B" : "None (raw)"
    }
}
