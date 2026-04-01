import Foundation

// MARK: - App State

enum AppState: String {
    case idle
    case recording
    case processing
}

// MARK: - Widget UI State

enum WidgetUIState: String {
    case idle
    case recordingHotkey
    case recordingClick
    case processing
}

// MARK: - Recording Source

enum RecordingSource {
    case hotkey
    case widget
}

// MARK: - Language

enum LanguagePreference: String, Codable, CaseIterable {
    case english
    case hindi
}

// MARK: - Widget Error

struct WidgetError: Equatable {
    let code: ErrorCode
    let message: String

    enum ErrorCode: String {
        case noAudio = "NO_AUDIO"
        case streamTimeout = "STREAM_TIMEOUT"
        case wsClosed = "WS_CLOSED"
        case serverError = "SERVER_ERROR"
        case transcriptionFailed = "TRANSCRIPTION_FAILED"
        case formattingFailed = "FORMATTING_FAILED"
        case pasteFailed = "PASTE_FAILED"
    }
}

// MARK: - Audio Stream Stats (VAD)

struct AudioStreamStats {
    var chunkCount: Int = 0
    var pcmBytes: Int = 0
    var avgRms: Float = 0
    var maxRms: Float = 0
    var baselineRms: Float = 0
    var voicedMs: Double = 0
    var hasSpeech: Bool = false
    var isBorderlineSpeech: Bool = false

    static let minVoicedMs: Double = 180
    static let minDelta: Float = 0.0035
    static let baselineMultiplier: Float = 2.0
    static let baselineWindowMs: Double = 300
    static let chunkDurationMs: Double = 100
}
