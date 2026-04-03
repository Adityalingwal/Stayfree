import Foundation

protocol PasteServiceProtocol {
    /// Paste text into the currently focused app.
    /// Tier 1: AXUIElement direct insert (no clipboard).
    /// Tier 2: Clipboard save → paste → restore (Terminal fallback).
    /// Returns true if paste was successful.
    func paste(_ text: String) -> Bool

    /// Check if accessibility permission is granted (required for both tiers).
    func checkAccessibilityPermission() -> Bool
}
