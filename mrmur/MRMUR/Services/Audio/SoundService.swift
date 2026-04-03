import AVFoundation

/// Plays start/stop chime sounds for recording feedback.
/// Uses AVAudioPlayer with bundled .caf files.
/// If sound files are missing, fails silently (sound is optional UX).
final class SoundService: SoundServiceProtocol {
    private var player: AVAudioPlayer?
    private let isEnabled: () -> Bool

    /// - Parameter isEnabled: Closure that checks Settings.soundEnabled at play time.
    init(isEnabled: @escaping () -> Bool) {
        self.isEnabled = isEnabled
    }

    func playStartChime() {
        guard isEnabled() else { return }
        playSound(named: "start-chime")
    }

    func playStopChime() {
        guard isEnabled() else { return }
        playSound(named: "stop-chime")
    }

    private func playSound(named name: String) {
        guard let url = Bundle.main.url(forResource: name, withExtension: "caf") else {
            print("[Sound] \(name).caf not found in bundle")
            return
        }
        do {
            player = try AVAudioPlayer(contentsOf: url)
            player?.volume = 0.5
            player?.play()
        } catch {
            print("[Sound] Failed to play \(name): \(error.localizedDescription)")
        }
    }
}
