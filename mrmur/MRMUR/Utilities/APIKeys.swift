import Foundation

/// Reads API keys from Info.plist (populated by Config.xcconfig) or environment variables.
/// Personal use — keys bundled in build config, not user-facing.
enum APIKeys {
    static var groq: String {
        // First check environment variable, then Info.plist (set by xcconfig)
        if let env = ProcessInfo.processInfo.environment["GROQ_API_KEY"], !env.isEmpty {
            return env
        }
        if let plist = Bundle.main.object(forInfoDictionaryKey: "GROQ_API_KEY") as? String, !plist.isEmpty {
            return plist
        }
        fatalError("GROQ_API_KEY not found. Set it in Config.xcconfig or as environment variable.")
    }

    static var sarvam: String {
        if let env = ProcessInfo.processInfo.environment["SARVAM_API_KEY"], !env.isEmpty {
            return env
        }
        if let plist = Bundle.main.object(forInfoDictionaryKey: "SARVAM_API_KEY") as? String, !plist.isEmpty {
            return plist
        }
        fatalError("SARVAM_API_KEY not found. Set it in Config.xcconfig or as environment variable.")
    }
}
