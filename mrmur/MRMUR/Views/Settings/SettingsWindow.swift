import AppKit
import SwiftUI

/// NSWindow for the settings dashboard. 1400x900, min 900x650, titlebar transparent.
/// Opened via tray menu "Open Settings" or Cmd+,.
final class SettingsWindowController {
    private var window: NSWindow?

    func show(appVM: AppViewModel, settings: Settings) {
        if let existing = window, existing.isVisible {
            existing.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let settingsView = SettingsView()
            .environment(appVM)
            .environment(settings)

        let hostingView = NSHostingView(rootView: settingsView)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1400, height: 900),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.contentView = hostingView
        window.title = "MRMUR Settings"
        window.titlebarAppearsTransparent = true
        window.minSize = NSSize(width: 900, height: 650)
        window.center()
        window.makeKeyAndOrderFront(nil)

        // Show dock icon while settings is open
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)

        window.delegate = WindowCloseDelegate { [weak self] in
            self?.window = nil
            // Hide dock icon again
            NSApp.setActivationPolicy(.accessory)
        }

        self.window = window
    }
}

// MARK: - Window Close Delegate

private final class WindowCloseDelegate: NSObject, NSWindowDelegate {
    let onClose: () -> Void

    init(onClose: @escaping () -> Void) {
        self.onClose = onClose
    }

    func windowWillClose(_ notification: Notification) {
        onClose()
    }
}
