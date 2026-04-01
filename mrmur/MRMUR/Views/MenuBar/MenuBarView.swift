import SwiftUI

struct MenuBarView: View {
    @Environment(AppViewModel.self) private var appVM
    var onOpenSettings: (() -> Void)?

    var body: some View {
        VStack {
            Text(statusText)
                .font(.headline)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)

            Divider()

            Button("Open Settings") {
                onOpenSettings?()
            }
            .keyboardShortcut(",", modifiers: .command)

            Divider()

            Button("Quit MRMUR") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q", modifiers: .command)
        }
    }

    private var statusText: String {
        switch appVM.state {
        case .idle: return "MRMUR — Ready"
        case .recording: return "MRMUR — Recording..."
        case .processing: return "MRMUR — Processing..."
        }
    }
}
