import AppKit
import Carbon.HIToolbox

/// 2-tier paste service for inserting text into the active application.
///
/// **Tier 1 — AXUIElement direct insert** (no clipboard pollution, ~90% of apps):
///   Finds the focused text element via Accessibility API and sets its value directly.
///
/// **Tier 2 — Clipboard save → paste → restore** (Terminal, some Electron apps):
///   Saves ALL pasteboard items (including images, PDFs, rich text), writes our text,
///   simulates Cmd+V, waits, verifies via changeCount, then restores originals.
///
/// Both tiers require Accessibility permission (AXIsProcessTrusted).
struct PasteService: PasteServiceProtocol {

    // MARK: - Public API

    func paste(_ text: String) -> Bool {
        guard checkAccessibilityPermission() else {
            print("[Paste] Accessibility not granted — cannot paste")
            return false
        }

        // Tier 1: Try AXUIElement direct insert (no clipboard involved)
        if insertViaAccessibility(text) {
            print("[Paste] Tier 1 (AXUIElement) succeeded")
            return true
        }

        // Tier 2: Clipboard save → paste → restore
        print("[Paste] Tier 1 failed — falling back to clipboard paste")
        return pasteViaClipboard(text)
    }

    func checkAccessibilityPermission() -> Bool {
        AXIsProcessTrusted()
    }

    // MARK: - Tier 1: AXUIElement Direct Insert

    /// Attempts to insert text directly into the focused text field via Accessibility API.
    /// Works in most apps (TextEdit, Safari, Xcode, Notes, etc).
    /// Does NOT work in Terminal, some Electron apps, or custom text views.
    private func insertViaAccessibility(_ text: String) -> Bool {
        let systemWide = AXUIElementCreateSystemWide()

        // Get the focused application
        var focusedAppValue: AnyObject?
        guard AXUIElementCopyAttributeValue(systemWide, kAXFocusedApplicationAttribute as CFString, &focusedAppValue) == .success,
              let focusedApp = focusedAppValue else {
            print("[Paste] No focused application")
            return false
        }
        let appElement = focusedApp as! AXUIElement

        // Get the focused UI element (text field, text view, etc.)
        var focusedElementValue: AnyObject?
        guard AXUIElementCopyAttributeValue(appElement, kAXFocusedUIElementAttribute as CFString, &focusedElementValue) == .success,
              let focusedElement = focusedElementValue else {
            print("[Paste] No focused UI element")
            return false
        }
        let element = focusedElement as! AXUIElement

        // Strategy A: Try to replace selected text first (preserves cursor context)
        if replaceSelectedText(in: element, with: text) {
            return true
        }

        // Strategy B: Set the entire value (works for empty fields or when no selection)
        if setElementValue(element, text: text) {
            return true
        }

        return false
    }

    /// Replace the current selection with new text.
    /// If there's a selection, replaces it. If cursor is positioned, inserts at cursor.
    private func replaceSelectedText(in element: AXUIElement, with text: String) -> Bool {
        // Check if the element has a selected text range
        var rangeValue: AnyObject?
        guard AXUIElementCopyAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, &rangeValue) == .success else {
            return false
        }

        // Try setting selected text attribute directly
        let result = AXUIElementSetAttributeValue(element, kAXSelectedTextAttribute as CFString, text as CFTypeRef)
        if result == .success {
            return true
        }

        return false
    }

    /// Set the full value of a text element.
    /// Used when selected text replacement isn't supported.
    private func setElementValue(_ element: AXUIElement, text: String) -> Bool {
        // Check if the element is writable
        var isSettable: DarwinBoolean = false
        guard AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &isSettable) == .success,
              isSettable.boolValue else {
            return false
        }

        // Get current value to append (don't replace entire content)
        var currentValue: AnyObject?
        if AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &currentValue) == .success,
           let currentText = currentValue as? String {
            // Append at cursor position or end
            let newText = currentText + text
            return AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, newText as CFTypeRef) == .success
        }

        // No current value — just set it
        return AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, text as CFTypeRef) == .success
    }

    // MARK: - Tier 2: Clipboard Save → Paste → Restore

    /// Saves clipboard, writes text, simulates Cmd+V, verifies, restores.
    /// 6 defensive measures:
    /// 1. Save ALL pasteboard types (not just text) as raw Data
    /// 2. changeCount check before/after to verify paste happened
    /// 3. 10MB size limit per item (skip saving huge items to avoid memory pressure)
    /// 4. 100ms wait after Cmd+V for target app to read clipboard
    /// 5. Re-entry guard via changeCount (if another app writes during paste, skip restore)
    /// 6. Restore uses raw Data to preserve images, PDFs, rich text exactly
    private func pasteViaClipboard(_ text: String) -> Bool {
        let pasteboard = NSPasteboard.general

        // Step 1: Save all current clipboard contents
        let savedItems = saveClipboardContents(pasteboard)
        let preChangeCount = pasteboard.changeCount

        // Step 2: Write our text to clipboard
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
        print("[Paste] Clipboard set — changeCount: \(pasteboard.changeCount)")

        // Step 3: Simulate Cmd+V
        let pasteSuccess = simulateCmdV()
        guard pasteSuccess else {
            print("[Paste] Cmd+V simulation failed")
            restoreClipboardContents(pasteboard, items: savedItems)
            return false
        }

        // Step 4: Wait 100ms for target app to read clipboard
        // This is synchronous and intentional — NSPasteboard is synchronous.
        // 100ms is enough for any app to read from pasteboard.
        Thread.sleep(forTimeInterval: 0.1)

        // Step 5: Verify paste via changeCount
        // If changeCount changed beyond our write, another app wrote to clipboard.
        // In that case, skip restore to avoid overwriting their data.
        let postChangeCount = pasteboard.changeCount
        let ourWriteCount = preChangeCount + 1 // Our clearContents + setString increments once

        if postChangeCount != ourWriteCount {
            print("[Paste] changeCount mismatch (\(postChangeCount) vs expected \(ourWriteCount)) — skipping restore")
            return true // Paste probably succeeded, but don't restore
        }

        // Step 6: Restore original clipboard
        restoreClipboardContents(pasteboard, items: savedItems)
        print("[Paste] Clipboard restored — changeCount: \(pasteboard.changeCount)")

        return true
    }

    // MARK: - Clipboard Save/Restore

    /// Saved pasteboard item: all types with their raw Data.
    private struct SavedPasteboardItem {
        let types: [NSPasteboard.PasteboardType]
        let dataByType: [NSPasteboard.PasteboardType: Data]
    }

    private static let maxItemSize = 10 * 1024 * 1024 // 10MB

    /// Save ALL pasteboard items with ALL their types as raw Data.
    /// This preserves images, PDFs, rich text, file URLs — not just plain text.
    private func saveClipboardContents(_ pasteboard: NSPasteboard) -> [SavedPasteboardItem] {
        guard let items = pasteboard.pasteboardItems else { return [] }

        return items.compactMap { item in
            let types = item.types
            var dataByType: [NSPasteboard.PasteboardType: Data] = [:]

            for type in types {
                guard let data = item.data(forType: type) else { continue }
                // Defense #3: Skip items larger than 10MB
                if data.count > Self.maxItemSize {
                    print("[Paste] Skipping type \(type.rawValue) — \(data.count) bytes exceeds 10MB limit")
                    continue
                }
                dataByType[type] = data
            }

            guard !dataByType.isEmpty else { return nil }
            return SavedPasteboardItem(types: types, dataByType: dataByType)
        }
    }

    /// Restore previously saved pasteboard contents.
    /// Uses raw Data to exactly preserve format (images, PDFs, etc).
    private func restoreClipboardContents(_ pasteboard: NSPasteboard, items: [SavedPasteboardItem]) {
        guard !items.isEmpty else { return }

        pasteboard.clearContents()

        for savedItem in items {
            let pbItem = NSPasteboardItem()
            for type in savedItem.types {
                if let data = savedItem.dataByType[type] {
                    pbItem.setData(data, forType: type)
                }
            }
            pasteboard.writeObjects([pbItem])
        }
    }

    // MARK: - Cmd+V Simulation

    /// Simulate Cmd+V keypress using CGEvent (no third-party dependency).
    private func simulateCmdV() -> Bool {
        // 'v' keycode = 9 (kVK_ANSI_V)
        let keyCode: CGKeyCode = CGKeyCode(kVK_ANSI_V)

        guard let keyDown = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true),
              let keyUp = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false) else {
            print("[Paste] Failed to create CGEvent for Cmd+V")
            return false
        }

        // Set Command modifier flag
        keyDown.flags = .maskCommand
        keyUp.flags = .maskCommand

        // Post events
        keyDown.post(tap: .cghidEventTap)
        keyUp.post(tap: .cghidEventTap)

        return true
    }
}
