import Foundation

/// Save/delete audio recordings. Coupled cleanup: entry removed → file deleted.
enum AudioStorageService {
    private static var storageDir: URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("MRMUR/Recordings", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Save PCM16 audio data as WAV file, return file path.
    static func save(pcm16Data: Data) -> String? {
        guard !pcm16Data.isEmpty else { return nil }
        let wav = WAVEncoder.encode(pcm16: pcm16Data)
        let filename = UUID().uuidString + ".wav"
        let url = storageDir.appendingPathComponent(filename)
        do {
            try wav.write(to: url)
            return url.path
        } catch {
            print("[AudioStorage] Failed to save: \(error.localizedDescription)")
            return nil
        }
    }

    /// Delete audio file at path.
    static func delete(at path: String) {
        guard !path.isEmpty else { return }
        try? FileManager.default.removeItem(atPath: path)
    }

    /// Delete all audio files for entries being removed.
    static func cleanupEntries(_ entries: [TranscriptionEntry]) {
        for entry in entries {
            if let path = entry.audioFilePath {
                delete(at: path)
            }
        }
    }
}
