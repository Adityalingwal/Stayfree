import Foundation

protocol HotkeyServiceProtocol {
    /// Start listening for global hotkey events.
    func start()

    /// Stop listening.
    func stop()

    /// Called when dictation recording should start (Left Option key pressed).
    var onRecordingStart: (() -> Void)? { get set }

    /// Called when dictation recording should stop (Left Option key released).
    var onRecordingStop: (() -> Void)? { get set }
}
