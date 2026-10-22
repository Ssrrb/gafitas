import Foundation

/// One question and its answer, as the page drew it: the program (after repair), the trail of what Pi did, and how
/// it ended.
struct ChatTurn: Codable, Equatable {
    var question: String
    var asked: Date
    var model: String
    var local: Bool
    var seconds: Int?
    /// The OpenUI program the page drew, repaired.
    var program: String
    var trail: [TrailLine]
    /// The trail's folded line: "Respondió qwen3:8b en 41 s · cita 7 de 15 lugares".
    var summary: String
    var thinking: String
    /// "done", "stopped" or "failed: …".
    var outcome: String

    struct TrailLine: Codable, Equatable {
        var text: String
        var places: Bool? = nil
    }
}

/// A chat: its questions and answers, and the places they cite (with their lines as they were, so a reopened chat
/// shows what the answer saw even after the code changed).
struct Chat {
    let id: String
    let created: Date
    var projects: [String]
    /// The ref table, as the page and the editor need it ("id", "repo", "path", "file", "first", "last", "text"…).
    var refs: [[String: Any]]
    var turns: [ChatTurn]

    var title: String { turns.first?.question ?? "" }
}

/// A chat in the history list.
struct ChatSummary: Identifiable, Equatable {
    let id: String
    let title: String
    let created: Date
    let updated: Date
    let projects: [String]
    let questions: Int
    let failed: Bool
}

/// Every chat, kept on this Mac as one JSON file each in `History/` inside the index folder, so a chat can be reopened
/// (drawn from the log, no model call) and continued.
struct ChatLog {
    let directory: URL

    init(index: URL) {
        directory = index.appendingPathComponent("History", isDirectory: true)
    }

    private func file(_ id: String) -> URL { directory.appendingPathComponent("\(id).json") }

    func save(_ chat: Chat) {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let turns = try JSONSerialization.jsonObject(with: encoder.encode(chat.turns))
            let object: [String: Any] = ["id": chat.id, "created": ISO8601DateFormatter().string(from: chat.created),
                                         "projects": chat.projects, "refs": chat.refs, "turns": turns]
            try JSONSerialization.data(withJSONObject: object).write(to: file(chat.id), options: .atomic)
        } catch {
            log("history: can't save \(chat.id): \(error)")
        }
    }

    func load(_ id: String) -> Chat? {
        guard let data = try? Data(contentsOf: file(id)),
              let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let turnsObject = object["turns"], let created = (object["created"] as? String).flatMap(Self.date)
        else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let turns = try? decoder.decode([ChatTurn].self, from: JSONSerialization.data(withJSONObject: turnsObject))
        else { return nil }
        return Chat(id: id, created: created, projects: object["projects"] as? [String] ?? [],
                    refs: object["refs"] as? [[String: Any]] ?? [], turns: turns)
    }

    /// Newest first.
    func list() -> [ChatSummary] {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.pathExtension == "json" }.compactMap { url -> ChatSummary? in
            guard let chat = load(url.deletingPathExtension().lastPathComponent), let last = chat.turns.last else { return nil }
            return ChatSummary(id: chat.id, title: chat.title, created: chat.created, updated: last.asked,
                               projects: chat.projects, questions: chat.turns.count, failed: last.outcome.hasPrefix("failed"))
        }.sorted { $0.updated > $1.updated }
    }

    func delete(_ id: String) {
        try? FileManager.default.removeItem(at: file(id))
    }

    func deleteAll() {
        try? FileManager.default.removeItem(at: directory)
    }

    /// How many chats, and how much disk they take.
    func usage() -> (chats: Int, bytes: Int64) {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.fileSizeKey])) ?? []
        let json = files.filter { $0.pathExtension == "json" }
        let bytes = json.reduce(Int64(0)) { $0 + Int64((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
        return (json.count, bytes)
    }

    static func newID() -> String {
        let stamp = ISO8601DateFormatter.string(from: Date(), timeZone: .current, formatOptions: [.withFullDate, .withTime])
        return "\(stamp)-\(UUID().uuidString.prefix(6))".replacingOccurrences(of: ":", with: "")
    }

    private static func date(_ text: String) -> Date? { ISO8601DateFormatter().date(from: text) }
}
