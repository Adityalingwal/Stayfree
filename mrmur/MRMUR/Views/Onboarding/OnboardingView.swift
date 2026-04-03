import SwiftUI

/// First-launch onboarding: Mic + Accessibility permission cards + Continue button.
/// 2s polling checks permission status. Continue enables when all granted.
struct OnboardingView: View {
    @EnvironmentObject private var state: OnboardingState
    let onComplete: () -> Void

    private var vm: OnboardingViewModel { state.viewModel }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            VStack(spacing: 12) {
                Image(systemName: "waveform")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(.blue)

                Text("Welcome to MRMUR")
                    .font(.system(size: 24, weight: .heavy))
                    .tracking(-0.5)

                Text("Voice dictation for macOS. Hold Left Option, speak, release — text appears.")
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 400)
            }
            .padding(.top, 48)
            .padding(.bottom, 36)

            // Permission cards
            VStack(spacing: 16) {
                PermissionCard(
                    icon: "mic.fill",
                    title: "Microphone",
                    description: "Required to capture your voice for dictation",
                    isGranted: vm.micGranted,
                    actionLabel: "Grant Access",
                    action: { vm.requestMicPermission() }
                )

                PermissionCard(
                    icon: "lock.shield",
                    title: "Accessibility",
                    description: "Required to detect hotkey and paste text into apps",
                    isGranted: vm.accessibilityGranted,
                    actionLabel: "Open Settings",
                    action: { vm.openAccessibilitySettings() }
                )
            }
            .padding(.horizontal, 40)

            Spacer()

            // Continue button
            Button {
                vm.completeOnboarding()
                onComplete()
            } label: {
                Text("Continue")
                    .font(.system(size: 14, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!vm.allPermissionsGranted)
            .padding(.horizontal, 40)
            .padding(.bottom, 32)

            if !vm.allPermissionsGranted {
                Text("Grant all permissions above to continue")
                    .font(.system(size: 12))
                    .foregroundStyle(.tertiary)
                    .padding(.bottom, 16)
            }
        }
        .frame(width: 520, height: 600)
        .onAppear {
            vm.startPolling()
        }
        .onDisappear {
            vm.stopPolling()
        }
    }
}

// MARK: - Permission Card

private struct PermissionCard: View {
    let icon: String
    let title: String
    let description: String
    let isGranted: Bool
    let actionLabel: String
    let action: () -> Void

    var body: some View {
        HStack(spacing: 16) {
            // Icon
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundStyle(isGranted ? .green : .blue)
                .frame(width: 44, height: 44)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(isGranted ? Color.green.opacity(0.1) : Color.blue.opacity(0.1))
                )

            // Text
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(title)
                        .font(.system(size: 14, weight: .semibold))
                    if isGranted {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(.green)
                    }
                }
                Text(description)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer()

            // Action button
            if !isGranted {
                Button(actionLabel, action: action)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isGranted ? Color.green.opacity(0.04) : Color(NSColor.controlBackgroundColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(
                            isGranted ? Color.green.opacity(0.3) : Color(NSColor.separatorColor).opacity(0.5),
                            lineWidth: 1
                        )
                )
        )
    }
}
