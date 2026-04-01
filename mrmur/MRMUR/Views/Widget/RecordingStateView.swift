import SwiftUI

/// Recording state with two modes:
/// - Hotkey: just wave animation (no buttons, key release stops recording)
/// - Click: cancel (X) + wave + stop (red circle) buttons
struct RecordingStateView: View {
    enum Mode { case hotkey, click }

    let mode: Mode
    let onCancel: () -> Void
    let onStop: () -> Void

    var body: some View {
        Group {
            switch mode {
            case .hotkey:
                // Just waves, no buttons — key release handles stop
                HStack(spacing: 0) {
                    WaveAnimationView(isActive: true)
                }
                .padding(.horizontal, 10)
                .frame(height: 26)
                .background(
                    Capsule().fill(Color(white: 0.18, opacity: 0.8))
                )

            case .click:
                // X | waves | stop button
                HStack(spacing: 5) {
                    // Cancel button
                    Button(action: onCancel) {
                        Image(systemName: "xmark")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(CircleButtonStyle(size: 16, hoverColor: .red.opacity(0.5)))

                    // Waves
                    WaveAnimationView(isActive: true)

                    // Stop button (red circle)
                    Button(action: onStop) {
                        Circle()
                            .fill(Color.red)
                    }
                    .buttonStyle(PlainButtonStyle())
                    .frame(width: 14, height: 14)
                }
                .padding(.horizontal, 5)
                .frame(height: 26)
                .background(
                    Capsule().fill(Color(white: 0.18, opacity: 0.8))
                )
            }
        }
    }
}

// MARK: - Circle Button Style

private struct CircleButtonStyle: ButtonStyle {
    let size: CGFloat
    let hoverColor: Color

    @State private var isHovering = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(width: size, height: size)
            .background(
                Circle().fill(isHovering ? hoverColor : Color(white: 0.43, opacity: 0.5))
            )
            .onHover { hovering in isHovering = hovering }
    }
}
