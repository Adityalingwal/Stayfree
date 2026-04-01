import AppKit
import SwiftUI

/// NSWindow for first-launch onboarding. 520x600, fixed size.
final class OnboardingWindowController {
    private var window: NSWindow?

    func show(settings: Settings, permissionService: any PermissionServiceProtocol, onComplete: @escaping () -> Void) {
        if let existing = window, existing.isVisible {
            existing.makeKeyAndOrderFront(nil)
            return
        }

        let onboardingView = OnboardingView(onComplete: { [weak self] in
            self?.close()
            onComplete()
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

        // Show dock icon during onboarding
        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        self.window = window
    }

    func close() {
        window?.close()
        window = nil
        NSApp.setActivationPolicy(.accessory)
    }
}

// MARK: - Shared state for onboarding (ObservableObject for environmentObject compatibility)

final class OnboardingState: ObservableObject {
    let viewModel: OnboardingViewModel

    init(settings: Settings, permissionService: any PermissionServiceProtocol) {
        self.viewModel = OnboardingViewModel(settings: settings, permissionService: permissionService)
    }
}
