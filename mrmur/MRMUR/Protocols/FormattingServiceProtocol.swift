import Foundation

protocol FormattingServiceProtocol {
    /// Format raw transcript text (remove fillers, add punctuation, apply dictionary).
    func format(_ rawText: String) async throws -> String
}
