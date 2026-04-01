import AVFoundation

protocol PermissionServiceProtocol {
    var micPermission: AVAuthorizationStatus { get }
    var accessibilityGranted: Bool { get }

    func checkMicPermission() -> AVAuthorizationStatus
    func requestMicPermission() async -> Bool
    func checkAccessibility() -> Bool
    func openAccessibilitySettings()
}
