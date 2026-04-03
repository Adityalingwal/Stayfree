import XCTest
@testable import MRMUR

// MARK: - Mock Services

final class MockAudioService: AudioServiceProtocol {
    var onAudioChunk: ((Data) -> Void)?
    var capturedData: Data = Data(repeating: 0x42, count: 1024)
    var startCalled = false
    var stopCalled = false
    var cancelCalled = false
    var shouldFailStart = false

    func startCapture(hindiMode: Bool) throws {
        startCalled = true
        if shouldFailStart {
            throw PipelineError.noAudio
        }
    }

    func stopCapture() -> Data {
        stopCalled = true
        return capturedData
    }

    func cancelCapture() {
        cancelCalled = true
    }

    func getStreamStats() -> AudioStreamStats? {
        nil
    }
}

final class MockTranscriptionService: TranscriptionServiceProtocol {
    var result: String = "hello world"
    var shouldFail = false
    var delay: TimeInterval = 0
    var transcribeCalled = false

    func transcribe(audio: Data) async throws -> String {
        transcribeCalled = true
        if delay > 0 {
            try await Task.sleep(for: .seconds(delay))
        }
        if shouldFail {
            throw PipelineError.transcriptionFailed("Mock transcription error")
        }
        return result
    }
}

final class MockFormattingService: FormattingServiceProtocol {
    var result: String = "Hello world."
    var shouldFail = false
    var delay: TimeInterval = 0
    var formatCalled = false

    func format(_ rawText: String) async throws -> String {
        formatCalled = true
        if delay > 0 {
            try await Task.sleep(for: .seconds(delay))
        }
        if shouldFail {
            throw PipelineError.formattingFailed("Mock formatting error")
        }
        return result
    }
}

final class MockPasteService: PasteServiceProtocol {
    var shouldSucceed = true
    var pasteCalled = false
    var lastPastedText: String?

    func paste(_ text: String) -> Bool {
        pasteCalled = true
        lastPastedText = text
        return shouldSucceed
    }

    func checkAccessibilityPermission() -> Bool {
        true
    }
}

final class MockHotkeyService: HotkeyServiceProtocol {
    var onRecordingStart: (() -> Void)?
    var onRecordingStop: (() -> Void)?
    var startCalled = false
    var stopCalled = false

    func start() { startCalled = true }
    func stop() { stopCalled = true }
}

final class MockPermissionService: PermissionServiceProtocol {
    var micGranted = true
    var accessibilityGranted = true

    func checkMic() -> Bool { micGranted }
    func requestMic() async -> Bool { micGranted }
    func checkAccessibility() -> Bool { accessibilityGranted }
    func openAccessibilitySettings() {}
}

// MARK: - Pipeline Tests

@MainActor
final class DictationPipelineTests: XCTestCase {

    private var appVM: AppViewModel!
    private var audio: MockAudioService!
    private var transcription: MockTranscriptionService!
    private var formatting: MockFormattingService!
    private var paste: MockPasteService!

    override func setUp() {
        super.setUp()
        let settings = Settings()
        appVM = AppViewModel(settings: settings)

        audio = MockAudioService()
        transcription = MockTranscriptionService()
        formatting = MockFormattingService()
        paste = MockPasteService()

        appVM.audioService = audio
        appVM.transcriptionService = transcription
        appVM.formattingService = formatting
        appVM.pasteService = paste
        appVM.hotkeyService = MockHotkeyService()
        appVM.permissionService = MockPermissionService()
    }

    // MARK: - Happy Path

    func testFullPipeline_recordTranscribeFormatPaste() async throws {
        transcription.result = "hello world"
        formatting.result = "Hello world."
        paste.shouldSucceed = true

        // Start recording
        appVM.handleRecordingStart()
        XCTAssertEqual(appVM.state, .recording)
        XCTAssertTrue(audio.startCalled)

        // Stop recording — triggers pipeline
        appVM.handleRecordingStop()

        // Wait for async pipeline to complete
        try await Task.sleep(for: .milliseconds(200))

        XCTAssertTrue(transcription.transcribeCalled, "Transcription should be called")
        XCTAssertTrue(formatting.formatCalled, "Formatting should be called")
        XCTAssertTrue(paste.pasteCalled, "Paste should be called")
        XCTAssertEqual(paste.lastPastedText, "Hello world.")
        XCTAssertEqual(appVM.state, .idle, "State should return to idle")
    }

    // MARK: - State Transitions

    func testRecordingStartSetsState() {
        appVM.handleRecordingStart()
        XCTAssertEqual(appVM.state, .recording)
        XCTAssertEqual(appVM.activeRecordingSource, .hotkey)
    }

    func testDoubleStartIgnored() {
        appVM.handleRecordingStart()
        XCTAssertEqual(appVM.state, .recording)

        // Second start should be ignored
        appVM.handleRecordingStart()
        XCTAssertEqual(appVM.state, .recording)
    }

    func testStopWithoutStartIgnored() {
        XCTAssertEqual(appVM.state, .idle)
        appVM.handleRecordingStop()
        XCTAssertEqual(appVM.state, .idle)
        XCTAssertFalse(audio.stopCalled)
    }

    func testCancelRecordingResetsState() {
        appVM.handleRecordingStart()
        XCTAssertEqual(appVM.state, .recording)

        appVM.cancelRecording()
        XCTAssertEqual(appVM.state, .idle)
        XCTAssertTrue(audio.cancelCalled)
    }

    // MARK: - Widget Recording

    func testWidgetRecordingFullCycle() async throws {
        transcription.result = "test"
        formatting.result = "Test."

        appVM.startWidgetRecording()
        XCTAssertEqual(appVM.state, .recording)
        XCTAssertEqual(appVM.activeRecordingSource, .widget)

        appVM.stopWidgetRecording()
        try await Task.sleep(for: .milliseconds(200))

        XCTAssertTrue(paste.pasteCalled)
        XCTAssertEqual(appVM.state, .idle)
    }

    func testHotkeyStopIgnoredDuringWidgetRecording() {
        appVM.startWidgetRecording()
        XCTAssertEqual(appVM.activeRecordingSource, .widget)

        // Hotkey stop should be ignored (wrong source)
        appVM.handleRecordingStop()
        XCTAssertEqual(appVM.state, .recording, "Should still be recording — hotkey can't stop widget recording")
    }

    // MARK: - Error Paths

    func testEmptyAudioShowsError() async throws {
        audio.capturedData = Data() // Empty

        appVM.handleRecordingStart()
        appVM.handleRecordingStop()

        try await Task.sleep(for: .milliseconds(100))

        XCTAssertNotNil(appVM.lastError, "Should show error for empty audio")
    }

    func testTranscriptionFailureShowsError() async throws {
        transcription.shouldFail = true

        appVM.handleRecordingStart()
        appVM.handleRecordingStop()

        try await Task.sleep(for: .milliseconds(200))

        XCTAssertNotNil(appVM.lastError, "Should show error for transcription failure")
        XCTAssertEqual(appVM.state, .idle, "State should reset after error")
    }

    func testFormattingFailureFallsThrough() async throws {
        formatting.shouldFail = true

        appVM.handleRecordingStart()
        appVM.handleRecordingStop()

        try await Task.sleep(for: .milliseconds(200))

        // Formatting failure should show error and reset state
        XCTAssertNotNil(appVM.lastError, "Should show error for formatting failure")
        XCTAssertEqual(appVM.state, .idle)
    }

    func testPasteFailureHandledGracefully() async throws {
        paste.shouldSucceed = false

        appVM.handleRecordingStart()
        appVM.handleRecordingStop()

        try await Task.sleep(for: .milliseconds(200))

        XCTAssertTrue(paste.pasteCalled, "Should have attempted paste")
        XCTAssertEqual(appVM.state, .idle)
    }

    // MARK: - Timeout Tests

    func testTranscriptionTimeout() async throws {
        transcription.delay = 10 // 10 seconds — exceeds 5s timeout

        appVM.handleRecordingStart()
        appVM.handleRecordingStop()

        // Wait slightly more than the 5s timeout
        try await Task.sleep(for: .seconds(6))

        XCTAssertEqual(appVM.state, .idle, "Should reset after timeout")
        XCTAssertNotNil(appVM.lastError, "Should show timeout error")
    }

    // MARK: - Concurrent Guard

    func testConcurrentPipelineBlocked() async throws {
        transcription.delay = 0.5 // Slow enough to overlap

        appVM.handleRecordingStart()
        appVM.handleRecordingStop()

        // Immediately try another recording — should be blocked
        appVM.handleRecordingStart()
        // State should be processing from first pipeline, not recording
        XCTAssertNotEqual(appVM.activeRecordingSource, .hotkey,
            "Second recording should be blocked while pipeline is running")
    }
}
