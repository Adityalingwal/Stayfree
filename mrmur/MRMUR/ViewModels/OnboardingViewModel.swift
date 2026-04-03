import Foundation

/// Permission flow: mic + accessibility check. 2s polling. Continue enabled when all granted.
@Observable
final class OnboardingViewModel {
    let settings: Settings
    let permissionService: any PermissionServiceProtocol

    var micGranted: Bool = false
    var accessibilityGranted: Bool = false

    private var pollingTask: Task<Void, Never>?

    var allPermissionsGranted: Bool {
        micGranted && accessibilityGranted
    }

    init(settings: Settings, permissionService: any PermissionServiceProtocol) {
        self.settings = settings
        self.permissionService = permissionService
        checkPermissions()
    }

    // MARK: - Permission Checks

    func checkPermissions() {
        micGranted = permissionService.checkMic()
        accessibilityGranted = permissionService.checkAccessibility()
    }

    func requestMicPermission() {
        Task { @MainActor in
            let granted = await permissionService.requestMic()
            micGranted = granted
        }
    }

    func openAccessibilitySettings() {
        permissionService.openAccessibilitySettings()
    }

    /// Start 2s polling loop for permission status during onboarding.
    func startPolling() {
        stopPolling()
        pollingTask = Task { @MainActor in
            while !Task.isCancelled {
                checkPermissions()
                if allPermissionsGranted { break }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    func completeOnboarding() {
        stopPolling()
        settings.onboardingComplete = true
    }
}
