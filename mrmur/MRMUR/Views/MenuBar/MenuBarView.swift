import SwiftUI

struct MenuBarView: View {
    @Environment(AppViewModel.self) private var appVM

    var body: some View {
        VStack {
            Text(statusText)
                .font(.headline)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)

            Divider()

            Button("Open Settings") {
                // Settings window will be wired in Phase 6
                print("[MenuBar] Open Settings tapped")
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
