import AppKit
import DigUpKit
import SwiftUI

/// Where the code cards get their lines.
final class Previews {
    static let shared = Previews()
    /// The text of a stretch of code (`Engine.text(ofSegment:code:)`), set when the app starts.
    var passage: (Int64, Bool) async -> String? = { _, _ in nil }
}

/// The lines of code that matched, numbered as in the file, in a monospaced card like an editor's: the query's words
/// are marked, the line it opens at is lit, and the card opens scrolled to it. Long lines run past the edge.
struct CodeLines: View {
    let row: ResultRow
    /// "lines 12–40" in the corner (a card that says it already leaves it out).
    var showsSpan = true
    @State private var text: String?

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: 1) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { offset, line in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(number(offset))
                                .foregroundStyle(.tertiary)
                                .frame(width: gutter, alignment: .trailing)
                            Text(marked(line))
                                .lineLimit(1)
                                .truncationMode(.tail)
                        }
                        .padding(.vertical, 0.5)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(isFocus(offset) ? Brand.amber.opacity(0.16) : Color.clear)
                        .id(offset)
                    }
                }
                .font(.system(size: 11, design: .monospaced))
                .padding(.vertical, 10)
                .padding(.horizontal, 8)
            }
            .scrollIndicators(.never)
            .onChange(of: text) {
                if let target = focusOffset ?? firstMarked, target > 3 { proxy.scrollTo(target - 2, anchor: .top) }
            }
        }
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.primary.opacity(0.045)))
        .overlay(alignment: .bottomTrailing) {
            if showsSpan, let span = row.span { PlaceBadge(text: span, onImage: true).padding(8) }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color.primary.opacity(0.1),
                                                                                    lineWidth: 0.5))
        .task(id: row.previewKey) { text = await Previews.shared.passage(row.segmentID, true) }
    }

    private var lines: [String] {
        (text ?? "").split(omittingEmptySubsequences: false, whereSeparator: { $0 == "\n" || $0 == "\r\n" })
            .map { $0.replacingOccurrences(of: "\t", with: "    ") }
    }

    /// A stretch's lines are the file's; a notebook's stretch has no numbers of its own, so its lines count from 1.
    private var firstNumber: Int { row.segment == .lines ? Int(row.loc ?? 1) : 1 }

    private func number(_ offset: Int) -> String { "\(firstNumber + offset)" }

    private var gutter: CGFloat { CGFloat(String(firstNumber + max(lines.count, 1)).count) * 7 + 2 }

    /// The line it opens at, in the stretch.
    private var focusOffset: Int? {
        guard row.segment == .lines, let focus = row.focus else { return nil }
        return Int(focus) - firstNumber
    }

    private func isFocus(_ offset: Int) -> Bool { offset == focusOffset }

    private var words: [String] {
        Array(Set((row.foundWords + row.terms).filter { $0.count >= 2 }))
    }

    private var firstMarked: Int? {
        lines.firstIndex { line in words.contains { !SearchText.matches(of: $0, in: line).isEmpty } }
    }

    private func marked(_ line: String) -> AttributedString {
        var result = AttributedString(line.isEmpty ? " " : line)
        for word in words {
            for found in SearchText.matches(of: word, in: line) {
                guard let range = Range(found, in: result) else { continue }
                result[range].backgroundColor = Color(red: 1, green: 0.86, blue: 0.2)
                result[range].foregroundColor = .black
            }
        }
        return result
    }
}
