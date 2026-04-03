import AppKit
import SwiftUI

/// NSWindow for first-launch onboarding. 520x600, fixed size.
final class OnboardingWindowController {
    private var window: NSWindow?
    private var onComplete: (() -> Void)?
    private var closeDelegate: OnboardingCloseDelegate?

    func show(settings: Settings, permissionService: any PermissionServiceProtocol, onComplete: @escaping () -> Void) {
        if let existing = window, existing.isVisible {
            existing.makeKeyAndOrderFront(nil)
            return
        }

        self.onComplete = onComplete

        let onboardingView = OnboardingView(onComplete: { [weak self] in
            self?.close()
        })
        .environment(settings)

        let hostingView = NSHostingView(rootView: onboardingView
            .environmentObject(OnboardingState(settings: settings, permissionService: permissionService)))

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 600),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.contentView = hostingView
        window.title = "Welcome to MRMUR"
        window.isReleasedWhenClosed = false
        window.styleMask.remove(.resizable)
        window.center()

        // Handle X button close — same cleanup as Continue button
        let delegate = OnboardingCloseDelegate { [weak self] in
            self?.cleanup()
        }
        window.delegate = delegate
        self.closeDelegate = delegate

        // Show dock icon during onboarding
        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        self.window = window
    }

    func close() {
        window?.close()
        cleanup()
    }

    private func cleanup() {
        window = nil
        closeDelegate = nil
        NSApp.setActivationPolicy(.accessory)
        onComplete?()
        onComplete = nil
    }
}

// MARK: - Window Close Delegate

private final class OnboardingCloseDelegate: NSObject, NSWindowDelegate {
    let onClose: () -> Void

    init(onClose: @escaping () -> Void) {
        self.onClose = onClose
    }

    func windowWillClose(_ notification: Notification) {
        onClose()
    }
}

// MARK: - Shared state for onboarding (ObservableObject for environmentObject compatibility)

final class OnboardingState: ObservableObject {
    let viewModel: OnboardingViewModel

    init(settings: Settings, permissionService: any PermissionServiceProtocol) {
        self.viewModel = OnboardingViewModel(settings: settings, permissionService: permissionService)
    }
}
