import AVFoundation
import Cocoa

/// Checks and requests microphone + accessibility permissions.
/// Polls every 2 seconds during onboarding for live permission updates.
@Observable
final class PermissionService: PermissionServiceProtocol {
    private(set) var micPermission: AVAuthorizationStatus = .notDetermined
    private(set) var accessibilityGranted: Bool = false
    private var pollTimer: Timer?

    init() {
        micPermission = checkMicPermission()
        accessibilityGranted = checkAccessibility()
    }

    @discardableResult
    func checkMicPermission() -> AVAuthorizationStatus {
        let status = AVCaptureDevice.authorizationStatus(for: .audio)
        micPermission = status
        return status
    }

    func requestMicPermission() async -> Bool {
        let granted = await AVCaptureDevice.requestAccess(for: .audio)
        await MainActor.run {
            micPermission = granted ? .authorized : .denied
        }
        return granted
    }

    func checkAccessibility() -> Bool {
        let trusted = AXIsProcessTrusted()
        accessibilityGranted = trusted
        return trusted
    }

    func openAccessibilitySettings() {
        // Open System Settings > Privacy & Security > Accessibility
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") else {
            print("[Permissions] Failed to create Accessibility settings URL")
            return
        }
        NSWorkspace.shared.open(url)
    }

    // MARK: - Polling (for onboarding)

    func startPolling() {
        guard pollTimer == nil else { return }
        pollTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.checkMicPermission()
            _ = self?.checkAccessibility()
        }
    }

    func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }
}
