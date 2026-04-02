import AppKit
import SwiftUI

/// NSPanel subclass for the floating dictation widget.
/// Always-on-top, non-activating, transparent, positioned above the dock.
/// Resizes between states: idle (60×16), recording (120×34), processing (60×24).
final class FloatingWidgetWindow: NSPanel {

    /// Widget dimensions per state (matches Electron exactly).
    enum Layout {
        case idle
        case recording
        case processing

        var size: NSSize {
            switch self {
            case .idle: return NSSize(width: 60, height: 16)
            case .recording: return NSSize(width: 120, height: 34)
            case .processing: return NSSize(width: 60, height: 24)
            }
        }
    }

    init() {
        let initialSize = Layout.idle.size
        super.init(
            contentRect: NSRect(origin: .zero, size: initialSize),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        // Floating panel config
        level = .floating
        isFloatingPanel = true
        hidesOnDeactivate = false
        canHide = false

        // Transparent + non-interactive with system
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false

        // Cannot become key window — never steals focus from user's app
        // (overridden via canBecomeKey below)

        // Visible on all Spaces
        collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]

        // Position at bottom center
        updatePosition(for: .idle)
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }

    /// Update window size and position for the given layout.
    /// Always centers horizontally, positions 8px above dock area.
    func updateLayout(_ layout: Layout, animated: Bool = true) {
        let newFrame = calculateFrame(for: layout)
        if animated {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = 0.15
                context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                animator().setFrame(newFrame, display: true)
            }
        } else {
            setFrame(newFrame, display: true)
        }
    }

    /// Recalculate position and size for the given layout (e.g., on screen change). Not animated.
    func updatePosition(for layout: Layout) {
        let frame = calculateFrame(for: layout)
        setFrame(frame, display: true)
    }

    private func calculateFrame(for layout: Layout) -> NSRect {
        guard let screen = NSScreen.main else {
            return NSRect(origin: .zero, size: layout.size)
        }

        let workArea = screen.visibleFrame
        let size = layout.size
        let padding = DockPositionDetector.bottomPadding

        // Center horizontally in work area
        let x = workArea.origin.x + (workArea.width - size.width) / 2

        // Position from bottom of work area + padding
        let y = workArea.origin.y + padding

        return NSRect(x: x, y: y, width: size.width, height: size.height)
    }
}
