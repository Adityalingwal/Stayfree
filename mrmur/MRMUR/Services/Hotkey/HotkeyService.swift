import Cocoa
import CoreGraphics

/// Global hotkey detection via CGEvent tap.
/// Left Option (keycode 58) = push-to-talk dictation.
/// Minimal callback + async dispatch pattern — callback <1ms, pipeline triggers async.
final class HotkeyService: HotkeyServiceProtocol {
    var onRecordingStart: (() -> Void)?
    var onRecordingStop: (() -> Void)?

    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var isRecording = false
    private var pressedKeys = Set<CGKeyCode>()

    // Left Option = keycode 58
    private let dictationKeyCode: CGKeyCode = 58

    func start() {
        guard eventTap == nil else { return }

        // We need flagsChanged events to detect modifier keys (Option).
        // keyDown/keyUp don't fire for modifiers alone.
        let mask = CGEventMask(1 << CGEventType.flagsChanged.rawValue)

        // The callback must be a C function pointer — capture `self` via userInfo.
        let unmanagedSelf = Unmanaged.passUnretained(self)

        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: mask,
            callback: { _, type, event, userInfo in
                guard let userInfo else { return Unmanaged.passUnretained(event) }
                let service = Unmanaged<HotkeyService>.fromOpaque(userInfo).takeUnretainedValue()
                service.handleFlagsChanged(event)
                return Unmanaged.passUnretained(event) // Don't swallow the event
            },
            userInfo: unmanagedSelf.toOpaque()
        ) else {
            print("[Hotkey] Failed to create event tap. Is Accessibility permission granted?")
            return
        }

        self.eventTap = tap
        self.runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)

        if let source = runLoopSource {
            CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        }

        CGEvent.tapEnable(tap: tap, enable: true)
        print("[Hotkey] Started — hold Left Option to record, release to stop")
    }

    func stop() {
        if let tap = eventTap {
            CGEvent.tapEnable(tap: tap, enable: false)
            if let source = runLoopSource {
                CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes)
            }
        }
        eventTap = nil
        runLoopSource = nil
        pressedKeys.removeAll()
        isRecording = false
        print("[Hotkey] Stopped")
    }

    // MARK: - Event Handling (minimal — only track key state, dispatch async)

    private func handleFlagsChanged(_ event: CGEvent) {
        let keycode = CGKeyCode(event.getIntegerValueField(.keyboardEventKeycode))
        let flags = event.flags

        // Only care about Left Option key
        guard keycode == dictationKeyCode else { return }

        let optionDown = flags.contains(.maskAlternate)

        if optionDown && !pressedKeys.contains(keycode) {
            // Key pressed — ignore key-repeat (already in set = repeat)
            pressedKeys.insert(keycode)

            if !isRecording {
                isRecording = true
                // Dispatch async to avoid blocking the CGEvent callback
                Task { @MainActor [weak self] in
                    self?.onRecordingStart?()
                }
            }
        } else if !optionDown && pressedKeys.contains(keycode) {
            // Key released
            pressedKeys.remove(keycode)

            if isRecording {
                isRecording = false
                Task { @MainActor [weak self] in
                    self?.onRecordingStop?()
                }
            }
        }
    }
}
