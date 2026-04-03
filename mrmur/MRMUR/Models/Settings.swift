import Foundation
import SwiftUI

/// Slim @Observable settings class — wraps @AppStorage for 5 settings values.
/// Services receive auto-updates when any property changes.
@Observable
final class Settings {
    // MARK: - Persisted via UserDefaults

    var language: LanguagePreference {
        get { LanguagePreference(rawValue: UserDefaults.standard.string(forKey: "languagePreference") ?? "english") ?? .english }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: "languagePreference") }
    }

    var selectedMicId: String {
        get { UserDefaults.standard.string(forKey: "selectedMicId") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "selectedMicId") }
    }

    var soundEnabled: Bool {
        get { UserDefaults.standard.object(forKey: "soundEnabled") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "soundEnabled") }
    }

    var onboardingComplete: Bool {
        get { UserDefaults.standard.bool(forKey: "onboardingComplete") }
        set { UserDefaults.standard.set(newValue, forKey: "onboardingComplete") }
    }

    /// Custom dictionary: term → replacement.
    /// JSON-encoded in UserDefaults.
    var dictionary: [String: String] {
        get {
            guard let data = UserDefaults.standard.data(forKey: "dictionary"),
                  let dict = try? JSONDecoder().decode([String: String].self, from: data)
            else { return [:] }
            return dict
        }
        set {
            if let data = try? JSONEncoder().encode(newValue) {
                UserDefaults.standard.set(data, forKey: "dictionary")
            }
        }
    }
}
