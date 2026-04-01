import AppKit

/// Detects macOS Dock position and auto-hide state to calculate widget vertical offset.
/// Widget is always bottom-center of screen; only vertical offset changes based on dock config.
enum DockPositionDetector {

    enum DockPosition: String {
        case bottom, left, right
    }

    /// Read dock orientation from UserDefaults (com.apple.dock).
    static var dockPosition: DockPosition {
        let orientation = UserDefaults(suiteName: "com.apple.dock")?.string(forKey: "orientation") ?? "bottom"
        switch orientation {
        case "left": return .left
        case "right": return .right
        default: return .bottom
        }
    }

    /// Check if dock auto-hide is enabled.
    static var isAutoHideEnabled: Bool {
        UserDefaults(suiteName: "com.apple.dock")?.bool(forKey: "autohide") ?? false
    }

    /// Calculate the Y offset from screen bottom for the widget.
    /// workArea already excludes the menu bar and dock (when visible).
    /// We add 8px padding from the bottom of the work area.
    static let bottomPadding: CGFloat = 8
}
