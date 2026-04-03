import SwiftUI

/// Horizontal pill tab picker for Settings window navigation.
struct PillNavigationView: View {
    @Binding var selection: SettingsPage

    var body: some View {
        HStack(spacing: 2) {
            ForEach(SettingsPage.allCases, id: \.self) { page in
                Button(page.title) {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selection = page
                    }
                }
                .buttonStyle(PillButtonStyle(isSelected: selection == page))
            }
        }
        .padding(3)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(NSColor.controlBackgroundColor))
        )
    }
}

enum SettingsPage: String, CaseIterable {
    case home
    case dictionary
    case settings

    var title: String {
        switch self {
        case .home: return "Home"
        case .dictionary: return "Dictionary"
        case .settings: return "Settings"
        }
    }
}

// MARK: - Pill Button Style

private struct PillButtonStyle: ButtonStyle {
    let isSelected: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: isSelected ? .semibold : .medium))
            .foregroundStyle(isSelected ? .primary : .secondary)
            .padding(.horizontal, 18)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 9)
                    .fill(isSelected ? Color(NSColor.controlBackgroundColor) : .clear)
                    .shadow(color: isSelected ? .black.opacity(0.08) : .clear, radius: 1.5, y: 0.5)
            )
    }
}
