import os

/// Centralized logging via os.Logger with subsystem categories.
enum Log {
    private static let subsystem = "com.mrmur.app"

    static let hotkey = Logger(subsystem: subsystem, category: "hotkey")
    static let audio = Logger(subsystem: subsystem, category: "audio")
    static let transcription = Logger(subsystem: subsystem, category: "transcription")
    static let formatting = Logger(subsystem: subsystem, category: "formatting")
    static let paste = Logger(subsystem: subsystem, category: "paste")
    static let pipeline = Logger(subsystem: subsystem, category: "pipeline")
    static let network = Logger(subsystem: subsystem, category: "network")
    static let permission = Logger(subsystem: subsystem, category: "permission")
    static let widget = Logger(subsystem: subsystem, category: "widget")
    static let settings = Logger(subsystem: subsystem, category: "settings")
    static let app = Logger(subsystem: subsystem, category: "app")
}
