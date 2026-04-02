import Foundation

enum PipelineError: Error, LocalizedError {
    case noAudio
    case streamTimeout
    case wsClosed
    case serverError(String)
    case transcriptionFailed(String)
    case formattingFailed(String)
    case pasteFailed
    case cancelled

    var errorDescription: String? {
        switch self {
        case .noAudio: return "No speech detected. Try speaking louder."
        case .streamTimeout: return "Transcription timed out. Try again."
        case .wsClosed: return "Connection lost. Retrying..."
        case .serverError(let msg): return "Server error: \(msg)"
        case .transcriptionFailed(let msg): return "Transcription failed: \(msg)"
        case .formattingFailed(let msg): return "Formatting failed: \(msg)"
        case .pasteFailed: return "Could not paste text."
        case .cancelled: return "Cancelled."
        }
    }

    var widgetError: WidgetError {
        switch self {
        case .noAudio: return WidgetError(code: .noAudio, message: errorDescription!)
        case .streamTimeout: return WidgetError(code: .streamTimeout, message: errorDescription!)
        case .wsClosed: return WidgetError(code: .wsClosed, message: errorDescription!)
        case .serverError: return WidgetError(code: .serverError, message: errorDescription!)
        case .transcriptionFailed: return WidgetError(code: .transcriptionFailed, message: errorDescription!)
        case .formattingFailed: return WidgetError(code: .formattingFailed, message: errorDescription!)
        case .pasteFailed: return WidgetError(code: .pasteFailed, message: errorDescription!)
        case .cancelled: return WidgetError(code: .cancelled, message: errorDescription!)
        }
    }
}

enum NetworkError: Error, LocalizedError {
    case invalidURL
    case httpError(statusCode: Int, body: String)
    case decodingError(String)
    case timeout
    case noData

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .httpError(let code, let body): return "HTTP \(code): \(body)"
        case .decodingError(let msg): return "Decoding error: \(msg)"
        case .timeout: return "Request timed out"
        case .noData: return "No data received"
        }
    }
}
