import SwiftUI

/// 5-bar waveform animation for recording state.
/// Each bar animates at a slightly different speed/phase for organic feel.
/// Matches Electron: green (#4ade80), 2px wide bars, 2px gap.
struct WaveAnimationView: View {
    let isActive: Bool
    var barCount: Int = 5

    /// Per-bar animation config: (duration, delay, minHeight, maxHeight)
    private static let barConfigs: [(duration: Double, delay: Double, minH: CGFloat, maxH: CGFloat)] = [
        (0.75, 0.0,  3, 10),
        (0.60, 0.06, 4, 14),
        (0.65, 0.0,  5, 12),
        (0.60, 0.10, 4, 14),
        (0.75, 0.03, 3, 10),
    ]

    /// Frozen heights (gentle curve, center tallest)
    private static let frozenHeights: [CGFloat] = [8, 12, 16, 12, 8]

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<barCount, id: \.self) { index in
                WaveBar(
                    isActive: isActive,
                    config: Self.barConfigs[index],
                    frozenHeight: Self.frozenHeights[index]
                )
            }
        }
        .frame(height: 16)
    }
}

// MARK: - Individual Wave Bar

private struct WaveBar: View {
    let isActive: Bool
    let config: (duration: Double, delay: Double, minH: CGFloat, maxH: CGFloat)
    let frozenHeight: CGFloat

    @State private var animating = false

    var body: some View {
        RoundedRectangle(cornerRadius: 1)
            .fill(isActive ? Color(red: 0.29, green: 0.87, blue: 0.50) : Color(white: 0.32))
            .frame(width: 2, height: isActive ? (animating ? config.maxH : config.minH) : frozenHeight)
            .animation(
                isActive
                    ? .easeInOut(duration: config.duration)
                        .repeatForever(autoreverses: true)
                        .delay(config.delay)
                    : .default,
                value: animating
            )
            .onAppear {
                if isActive { animating = true }
            }
            .onChange(of: isActive) { _, newValue in
                animating = newValue
            }
    }
}
