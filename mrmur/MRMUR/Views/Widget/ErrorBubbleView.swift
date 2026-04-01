import SwiftUI

/// Error bubble that appears above the widget.
/// Auto-dismisses after 2s (controlled by AppViewModel.showError).
/// Matches Electron: dark bg, red border, warning icon + message.
struct ErrorBubbleView: View {
    let message: String

    var body: some View {
        HStack(spacing: 6) {
            // Warning icon
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 11))
                .foregroundStyle(Color(red: 0.97, green: 0.44, blue: 0.44))

            // Error message
            Text(message)
                .font(.system(size: 11.5, weight: .medium))
                .foregroundStyle(Color(red: 0.99, green: 0.65, blue: 0.65, opacity: 0.95))
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .padding(.horizontal, 12)
        .frame(height: 32)
        .background(
            Capsule()
                .fill(Color(red: 0.12, green: 0.08, blue: 0.08, opacity: 0.92))
                .overlay(
                    Capsule()
                        .strokeBorder(Color.red.opacity(0.45), lineWidth: 1)
                )
        )
        .shadow(color: .black.opacity(0.4), radius: 6, y: 2)
        .transition(.asymmetric(
            insertion: .scale(scale: 0.85).combined(with: .opacity),
            removal: .opacity
        ))
    }
}
