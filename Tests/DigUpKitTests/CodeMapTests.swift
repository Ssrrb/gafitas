import Foundation
import Testing
@testable import DigUpKit

@Suite final class CodeMapTests {
    let folder: URL = {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("CodeMapTests-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()

    deinit {
        try? FileManager.default.removeItem(at: folder)
    }

    /// Two kinds of code, each near its own direction with some noise of its own, more of them than one block holds.
    func searcher() throws -> Searcher {
        let store = try IndexStore(directory: folder, file: IndexStore.codeFile)
        try store.db.transaction {
            for index in 0..<(VectorStorage.blockRows + 200) {
                let id = try store.insert(Candidate(path: "/code/\(index).py", kind: .code, size: 1, mtime: 1,
                                                    inode: UInt64(index + 1), device: 1))
                let noise = FakeEmbedder.vector(for: "\(index)")
                var vector = noise.map { $0 * 0.3 }
                vector[index % 2 == 0 ? 0 : 1] += 1
                let norm = vector.reduce(0) { $0 + $1 * $1 }.squareRoot()
                try store.addSegment(file: id, kind: .lines, modality: .text, vector: vector.map { $0 / norm })
            }
        }
        return try Searcher(store: store)
    }

    @Test func kindsOfCodeLandApartAndTheMapStaysTheSame() throws {
        let searcher = try searcher()
        let map = try #require(try searcher.map())
        #expect(map.x.count == VectorStorage.blockRows + 200)
        func centre(_ even: Bool) -> (Float, Float) {
            let picked = map.files.indices.filter { (map.files[$0] - 1) % 2 == (even ? 0 : 1) }
            return (picked.map { map.x[$0] }.reduce(0, +) / Float(picked.count),
                    picked.map { map.y[$0] }.reduce(0, +) / Float(picked.count))
        }
        let (a, b) = (centre(true), centre(false))
        let apart = ((a.0 - b.0) * (a.0 - b.0) + (a.1 - b.1) * (a.1 - b.1)).squareRoot()
        let spread = map.files.indices.filter { (map.files[$0] - 1) % 2 == 0 }
            .map { ((map.x[$0] - a.0) * (map.x[$0] - a.0) + (map.y[$0] - a.1) * (map.y[$0] - a.1)).squareRoot() }
            .reduce(0, +) / Float(map.files.count / 2)
        #expect(apart > spread * 3)

        // A question like the first kind lands with it.
        var question = [Float](repeating: 0, count: Vectors.dimension)
        question[0] = 1
        let place = map.place(question)
        #expect(((place.x - a.0) * (place.x - a.0) + (place.y - a.1) * (place.y - a.1)).squareRoot() < apart / 2)

        let again = try #require(try searcher.map())
        #expect(again.x == map.x && again.y == map.y)
    }
}
