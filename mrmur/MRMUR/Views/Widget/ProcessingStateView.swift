import SwiftUI

/// Processing state: spinner inside a small capsule.
/// Matches Electron: 48×16 with spinning circle.
struct ProcessingStateView: View {
    @State private var rotation: Double = 0

    var body: some View {
        Circle()
            .trim(from: 0.2, to: 1.0)
            .stroke(Color.blue.opacity(0.8), lineWidth: 1.5)
            .frame(width: 10, height: 10)
            .rotationEffect(.degrees(rotation))
            .onAppear {
                rotation = 0
                withAnimation(.linear(duration: 0.45).repeatForever(autoreverses: false)) {
                    rotation = 360
                }
            }
            .frame(width: 48, height: 16)
            .background(
                Capsule().fill(Color(white: 0.18, opacity: 0.8))
            )
    }
}
