import SwiftUI

/// Root view for the floating widget. Switches between states.
/// Hosted inside FloatingWidgetWindow (NSPanel).
struct FloatingWidgetView: View {
    @Environment(AppViewModel.self) private var appVM
    @State private var widgetVM: WidgetViewModel?

    var body: some View {
        ZStack {
            if let vm = widgetVM {
                widgetContent(vm)
            }
        }
        .onAppear {
            widgetVM = WidgetViewModel(appVM: appVM)
        }
    }

    @ViewBuilder
    private func widgetContent(_ vm: WidgetViewModel) -> some View {
        ZStack(alignment: .top) {
            // Error bubble floats above widget
            if let error = vm.error {
                ErrorBubbleView(message: error.message)
                    .offset(y: -44)
                    .transition(.scale.combined(with: .opacity))
                    .zIndex(1)
            }

            // Widget state views
            switch vm.uiState {
            case .idle:
                IdleStateView(onTap: vm.startRecording)
            case .recordingHotkey:
                RecordingStateView(mode: .hotkey, onCancel: {}, onStop: {})
            case .recordingClick:
                RecordingStateView(
                    mode: .click,
                    onCancel: vm.cancelRecording,
                    onStop: vm.stopRecording
                )
            case .processing:
                ProcessingStateView()
            }
        }
        .animation(.easeInOut(duration: 0.15), value: vm.uiState)
    }
}
