import AppKit
import DigUpKit

/// A place dug up for a question: a file, the part of it that matched, and why.
struct ResultRow: Identifiable, Equatable {
    let id: String          // the file's path
    let url: URL
    let name: String
    let folder: String      // "~/Downloads/Screenshots"
    let kind: FileKind
    let segment: SegmentKind
    let segmentID: Int64
    let loc: Double?        // PDF page, seconds into audio or video, or a stretch of code's first line
    let locEnd: Double?
    /// Code: the line to open at (where the name is defined, or the first line with the query's words).
    let focus: Double?
    let excerpt: String?    // matched words are wrapped in « »
    let matchedMeaning: Bool
    let matchedWords: Bool
    /// How far the meaning match stood out (`SearchHit.z`): the Ask window's closeness.
    let z: Double?
    let modified: Date
    let size: Int64
    let info: [String: String]
    /// The query's words (`Searcher.terms`): what the preview highlights on a page or in a passage.
    let terms: [String]

    init(_ hit: SearchHit, terms: [String] = []) {
        id = hit.path
        url = URL(fileURLWithPath: hit.path)
        name = url.lastPathComponent
        // Code says where it is in its repo: "billing/payments".
        if hit.kind == .code, let repo = hit.info["repo"], hit.path.hasPrefix(repo + "/") {
            let parent = (repo as NSString).deletingLastPathComponent
            folder = String(url.deletingLastPathComponent().path.dropFirst(parent.count + 1))
        } else {
            folder = tildePath(url.deletingLastPathComponent().path)
        }
        kind = hit.kind
        segment = hit.segment
        segmentID = hit.segmentID
        loc = hit.loc
        locEnd = hit.locEnd
        focus = hit.focus
        excerpt = hit.excerpt.flatMap { $0.isEmpty ? nil : $0 }
        z = hit.z
        matchedMeaning = (hit.z ?? 0) >= 2
        matchedWords = hit.keywordRank != nil
        modified = Date(timeIntervalSince1970: hit.modified)
        size = hit.size
        info = hit.info
        self.terms = terms
    }

    /// The words keyword search found in the excerpt (marked « »), as they're written there.
    var foundWords: [String] {
        guard let excerpt else { return [] }
        var words: [String] = []
        var rest = excerpt[...]
        while let open = rest.firstIndex(of: "«"), let close = rest[open...].firstIndex(of: "»") {
            let word = String(rest[rest.index(after: open)..<close])
            if !word.isEmpty, !words.contains(word) { words.append(word) }
            rest = rest[rest.index(after: close)...]
        }
        return words
    }

    /// The page or moment that matched, as a badge: "p. 3", "0:06", "♪ 0:25" (a video's sound), "L12–40" (code).
    var place: String? {
        guard let loc else { return nil }
        switch segment {
        case .page, .pageImage: return "p. \(Int(loc))"
        case .frame: return Self.clock(loc)
        case .audio: return kind == .video ? "♪ \(Self.clock(loc))" : Self.clock(loc)
        case .lines: return Int(loc) == Int(locEnd ?? loc) ? "L\(Int(loc))" : "L\(Int(loc))–\(Int(locEnd ?? loc))"
        case .cells: return span
        default: return nil
        }
    }

    /// The lines (or a notebook's cells) of code that matched: "lines 12–40", "cell 3".
    var span: String? {
        guard let loc else { return nil }
        let (first, last) = (Int(loc), Int(locEnd ?? loc))
        switch segment {
        case .lines: return first == last ? "line \(first)" : "lines \(first)–\(last)"
        case .cells: return first == last ? "cell \(first)" : "cells \(first)–\(last)"
        default: return nil
        }
    }

    /// What the preview shows: the moment or the page that matched, else the file.
    var previewKey: String { "\(id)|\(loc.map { "\($0)" } ?? "")" }

    static func clock(_ seconds: Double) -> String {
        let total = Int(seconds)
        return total >= 3600 ? String(format: "%d:%02d:%02d", total / 3600, total / 60 % 60, total % 60)
                             : String(format: "%d:%02d", total / 60, total % 60)
    }
}

extension FileKind {
    var symbol: String {
        switch self {
        case .screenshot: "camera.viewfinder"
        case .image: "photo"
        case .pdf: "doc.richtext"
        case .doc: "doc.text"
        case .audio: "waveform"
        case .video: "film"
        case .code: "chevron.left.forwardslash.chevron.right"
        }
    }
}
