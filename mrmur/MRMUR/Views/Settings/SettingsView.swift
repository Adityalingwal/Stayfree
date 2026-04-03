import SwiftUI

/// Root view for the Settings window. Pill tab navigation + page content.
struct SettingsView: View {
    @Environment(AppViewModel.self) private var appVM
    @Environment(Settings.self) private var settings
    @State private var activePage: SettingsPage = .home

    var body: some View {
        VStack(spacing: 0) {
            // Top bar with pill navigation
            HStack {
                // Logo
                HStack(spacing: 9) {
                    Image(systemName: "waveform")
                        .font(.system(size: 16, weight: .bold))
                    Text("MRMUR")
                        .font(.system(size: 16, weight: .heavy))
                        .tracking(-0.5)
                }
                .foregroundStyle(.primary)

                Spacer()

                PillNavigationView(selection: $activePage)

                Spacer()

                // Gear icon → jump to settings page
                Button {
                    activePage = .settings
                } label: {
                    Image(systemName: "gearshape")
                        .font(.system(size: 16))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            .background(Color(NSColor.windowBackgroundColor))

            Divider()

            // Page content
            ScrollView {
                pageContent
                    .frame(maxWidth: 860)
                    .padding(.horizontal, 48)
                    .padding(.vertical, 32)
                    .frame(maxWidth: .infinity)
            }
        }
        .frame(minWidth: 900, minHeight: 650)
    }

    @ViewBuilder
    private var pageContent: some View {
        switch activePage {
        case .home:
            HomePageView()
        case .dictionary:
            DictionaryPageView()
        case .settings:
            SettingsPageView()
        }
    }
}
