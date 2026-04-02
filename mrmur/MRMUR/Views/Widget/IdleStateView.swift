import SwiftUI

/// Idle state: thin 48×5 bar. Tap to start widget (click-mode) recording.
/// Matches Electron: rgba(90, 90, 95, 0.65), 2.5px corner radius, hover scale.
struct IdleStateView: View {
    let onTap: () -> Void

    @State private var isHovering = false

    var body: some View {
        RoundedRectangle(cornerRadius: 2.5)
            .fill(Color(white: isHovering ? 0.39 : 0.35, opacity: 0.65))
            .frame(width: 48, height: 5)
            .scaleEffect(x: isHovering ? 1.05 : 1.0)
            .animation(.easeOut(duration: 0.1), value: isHovering)
            .onHover { hovering in
                isHovering = hovering
            }
            .contentShape(Rectangle())
            .onTapGesture(perform: onTap)
    }
}
