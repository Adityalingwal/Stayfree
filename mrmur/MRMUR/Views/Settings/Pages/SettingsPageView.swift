import SwiftUI

/// Settings page: Language toggle, mic selector, sound toggle, about info.
struct SettingsPageView: View {
    @Environment(Settings.self) private var settings
    @State private var settingsVM: SettingsViewModel?

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            // Header
            VStack(alignment: .leading, spacing: 4) {
                Text("Settings")
                    .font(.system(size: 22, weight: .heavy))
                    .tracking(-0.5)
                Text("Customize your MRMUR experience")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }

            if let vm = settingsVM {
                VStack(spacing: 16) {
                    languageSection(vm)
                    microphoneSection(vm)
                    soundSection(vm)
                    aboutSection(vm)
                }
            }
        }
        .onAppear {
            if settingsVM == nil {
                settingsVM = SettingsViewModel(settings: settings)
            }
        }
    }

    // MARK: - Language

    private func languageSection(_ vm: SettingsViewModel) -> some View {
        SectionCard(title: "Language", icon: "globe", description: "Choose your primary dictation language") {
            VStack(spacing: 10) {
                LanguageOption(
                    label: "English",
                    description: "Pure English dictation with LLM formatting via Groq",
                    isSelected: vm.language == .english
                ) {
                    vm.language = .english
                }
                LanguageOption(
                    label: "Hinglish",
                    description: "Mixed Hindi-English in Roman script",
                    badge: "Beta",
                    isSelected: vm.language == .hindi
                ) {
                    vm.language = .hindi
                }
            }
        }
    }

    // MARK: - Microphone

    private func microphoneSection(_ vm: SettingsViewModel) -> some View {
        @Bindable var vm = vm
        return SectionCard(title: "Microphone", icon: "mic", description: "Select input device for dictation") {
            Picker("", selection: $vm.selectedMicId) {
                Text("System Default").tag("")
                ForEach(vm.microphones, id: \.id) { mic in
                    Text(mic.name).tag(mic.id)
                }
            }
            .labelsHidden()
        }
    }

    // MARK: - Sound

    private func soundSection(_ vm: SettingsViewModel) -> some View {
        SectionCard(title: "Sound Effects", icon: "speaker.wave.2", description: "Audio feedback when recording") {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(vm.soundEnabled ? "Enabled" : "Disabled")
                        .font(.system(size: 13, weight: .semibold))
                    Text(vm.soundEnabled ? "You'll hear a beep on record start/stop" : "Silent mode — no audio cues")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Toggle("", isOn: Binding(
                    get: { vm.soundEnabled },
                    set: { vm.soundEnabled = $0 }
                ))
                .toggleStyle(.switch)
                .labelsHidden()
            }
        }
    }

    // MARK: - About

    private func aboutSection(_ vm: SettingsViewModel) -> some View {
        SectionCard(title: "About", icon: "info.circle", description: "System information") {
            VStack(spacing: 0) {
                AboutRow(label: "Platform", value: "macOS")
                AboutRow(label: "Language Mode", value: vm.language == .english ? "English" : "Hinglish")
                AboutRow(label: "STT Model", value: vm.sttModelName)
                AboutRow(label: "Formatter", value: vm.formatterName)
                AboutRow(label: "Hotkey", value: "Left Option (Alt)", isLast: true)
            }
        }
    }
}

// MARK: - Section Card

private struct SectionCard<Content: View>: View {
    let title: String
    let icon: String
    let description: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundStyle(.blue)
                    .frame(width: 36, height: 36)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color.blue.opacity(0.1))
                    )

                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(size: 13, weight: .semibold))
                    Text(description)
                        .font(.system(size: 11.5))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(16)

            Divider().padding(.leading, 16)

            // Content
            content()
                .padding(20)
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(NSColor.controlBackgroundColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .strokeBorder(Color(NSColor.separatorColor).opacity(0.5), lineWidth: 0.5)
                )
        )
    }
}

// MARK: - Language Option

private struct LanguageOption: View {
    let label: String
    let description: String
    var badge: String? = nil
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(alignment: .top, spacing: 12) {
                // Radio dot
                Circle()
                    .fill(isSelected ? Color.blue : .clear)
                    .frame(width: 18, height: 18)
                    .overlay(
                        Circle()
                            .strokeBorder(isSelected ? Color.blue : Color.secondary.opacity(0.4), lineWidth: 2)
                    )
                    .overlay(
                        isSelected ?
                            Circle().fill(.white).frame(width: 6, height: 6) : nil
                    )

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(label)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(isSelected ? .blue : .primary)
                        if let badge {
                            Text(badge)
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.blue)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 1)
                                .background(
                                    Capsule().fill(Color.blue.opacity(0.1))
                                )
                        }
                    }
                    Text(description)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color.blue.opacity(0.04) : Color(NSColor.windowBackgroundColor))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(isSelected ? Color.blue : Color(NSColor.separatorColor), lineWidth: 1.5)
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - About Row

private struct AboutRow: View {
    let label: String
    let value: String
    var isLast: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(label)
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                Spacer()
                Text(value)
                    .font(.system(size: 13, weight: .semibold))
            }
            .padding(.vertical, 10)

            if !isLast {
                Divider()
            }
        }
    }
}
