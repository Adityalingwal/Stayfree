import Foundation

/// Single generic HTTP client used by both Groq and Sarvam REST services.
/// DRY — shared request building, JSON decoding, error handling.
struct APIClient {
    let baseURL: String
    let defaultHeaders: [String: String]
    let timeoutInterval: TimeInterval

    private let session: URLSession

    init(baseURL: String, defaultHeaders: [String: String], timeoutInterval: TimeInterval = 30) {
        self.baseURL = baseURL
        self.defaultHeaders = defaultHeaders
        self.timeoutInterval = timeoutInterval

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = timeoutInterval
        self.session = URLSession(configuration: config)
    }

    // MARK: - JSON POST

    /// Send a JSON POST request and decode the response.
    func postJSON<T: Decodable>(
        path: String,
        body: [String: Any],
        extraHeaders: [String: String] = [],
        responseType: T.Type
    ) async throws -> T {
        let url = try buildURL(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        // Merge headers
        for (key, value) in defaultHeaders { request.setValue(value, forHTTPHeaderField: key) }
        for (key, value) in extraHeaders { request.setValue(value, forHTTPHeaderField: key) }
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.noData
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "unknown"
            throw NetworkError.httpError(statusCode: httpResponse.statusCode, body: body)
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw NetworkError.decodingError(error.localizedDescription)
        }
    }

    // MARK: - Multipart POST (for file uploads like Whisper)

    /// Send a multipart/form-data POST request (for audio file uploads).
    func postMultipart<T: Decodable>(
        path: String,
        fields: [(name: String, value: String)],
        fileField: String,
        fileData: Data,
        fileName: String,
        mimeType: String,
        responseType: T.Type
    ) async throws -> T {
        let url = try buildURL(path: path)
        let boundary = "MRMUR-\(UUID().uuidString)"

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        for (key, value) in defaultHeaders { request.setValue(value, forHTTPHeaderField: key) }

        // Build multipart body
        var body = Data()

        // String fields
        for field in fields {
            body.append("--\(boundary)\r\n")
            body.append("Content-Disposition: form-data; name=\"\(field.name)\"\r\n\r\n")
            body.append("\(field.value)\r\n")
        }

        // File field
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"\(fileField)\"; filename=\"\(fileName)\"\r\n")
        body.append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(fileData)
        body.append("\r\n")

        // End boundary
        body.append("--\(boundary)--\r\n")

        request.httpBody = body

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.noData
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let bodyStr = String(data: data, encoding: .utf8) ?? "unknown"
            throw NetworkError.httpError(statusCode: httpResponse.statusCode, body: bodyStr)
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw NetworkError.decodingError(error.localizedDescription)
        }
    }

    /// Multipart POST that returns raw text (for Whisper response_format=text).
    func postMultipartText(
        path: String,
        fields: [(name: String, value: String)],
        fileField: String,
        fileData: Data,
        fileName: String,
        mimeType: String
    ) async throws -> String {
        let url = try buildURL(path: path)
        let boundary = "MRMUR-\(UUID().uuidString)"

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        for (key, value) in defaultHeaders { request.setValue(value, forHTTPHeaderField: key) }

        var body = Data()
        for field in fields {
            body.append("--\(boundary)\r\n")
            body.append("Content-Disposition: form-data; name=\"\(field.name)\"\r\n\r\n")
            body.append("\(field.value)\r\n")
        }
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"\(fileField)\"; filename=\"\(fileName)\"\r\n")
        body.append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n")

        request.httpBody = body

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.noData
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let bodyStr = String(data: data, encoding: .utf8) ?? "unknown"
            throw NetworkError.httpError(statusCode: httpResponse.statusCode, body: bodyStr)
        }

        guard let text = String(data: data, encoding: .utf8) else {
            throw NetworkError.decodingError("Response is not valid UTF-8 text")
        }

        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Helpers

    private func buildURL(path: String) throws -> URL {
        guard let url = URL(string: baseURL + path) else {
            throw NetworkError.invalidURL
        }
        return url
    }
}

// MARK: - Data helper for multipart body building

private extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) {
            append(data)
        }
    }
}
