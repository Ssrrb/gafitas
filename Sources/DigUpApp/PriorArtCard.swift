import AppKit
import DigUpKit
import SwiftUI

/// How close a place is to the question, in words (never a score): from how far its meaning match stood out.
enum Closeness {
    case veryClose, close, related

    init(_ row: ResultRow) {
        let z = row.z ?? 0
        self = z >= 4 ? .veryClose : z >= 3 ? .close : .related
    }

    var title: String {
        switch self {
        case .veryClose: "Very close"
        case .close: "Close"
        case .related: "Related"
        }
    }

    var segments: Int {
        switch self {
        case .veryClose: 3
        case .close: 2
        case .related: 1
        }
    }
}

/// ▰▰▱ Close · has your words
struct ClosenessMeter: View {
    let row: ResultRow

    var body: some View {
        let closeness = Closeness(row)
        HStack(spacing: 6) {
            HStack(spacing: 2) {
                ForEach(0..<3, id: \.self) { index in
                    Capsule()
                        .fill(index < closeness.segments ? AnyShapeStyle(Brand.amber) : AnyShapeStyle(.quaternary))
                        .frame(width: 10, height: 4)
                }
            }
            Text(closeness.title + (row.matchedWords ? " · has your words" : ""))
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(closeness.title + " match")
    }
}

/// A place dug up for the question: what it defines, where it is, how close, when it last changed, and a peek at the
/// lines. Selected, it shows more of them and what you can do with it.
struct PriorArtCard: View {
    let row: ResultRow
    /// Its first line that defines something ("def register_skill(…"), once read.
    let summary: String?
    let path: String
    let selected: Bool
    let reuse: () -> Void
    let adapt: () -> Void
    let ignore: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(summary ?? row.name)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 4)
                if let place = row.place { PlaceBadge(text: place) }
            }
            HStack(spacing: 4) {
                Text(path).lineLimit(1).truncationMode(.middle)
                Text("· Changed \(row.modified.formatted(.relative(presentation: .named)))")
                    .lineLimit(1)
                    .fixedSize()
            }
            .font(.system(size: 11))
            .foregroundStyle(.secondary)
            ClosenessMeter(row: row)
            CodeLines(row: row, showsSpan: false)
                .frame(height: selected ? 168 : 52)
                .allowsHitTesting(selected)
            if selected {
                HStack(spacing: 8) {
                    Button("Reuse", action: reuse)
                        .help("Open it in your editor at the line (↩)")
                    Button("Adapt…", action: adapt)
                        .help("Ask how to adapt it (⌥↩)")
                    Spacer()
                    Button("Ignore", action: ignore)
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                        .help("Leave it out of the answer (⌫)")
                }
                .controlSize(.small)
                .padding(.top, 2)
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(selected ? Color.accentColor.opacity(0.22) : Color.primary.opacity(0.04)))
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(Closeness(row).title) match. \(summary ?? row.name), \(path), "
                            + "\(row.span ?? ""), changed \(row.modified.formatted(.relative(presentation: .named)))")
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityAction(named: "Reuse", reuse)
        .accessibilityAction(named: "Adapt", adapt)
        .accessibilityAction(named: "Ignore", ignore)
    }
}

/// ● hermes-agent 4,812: a code folder, on or off for the question.
struct ProjectChip: View {
    let project: Project
    let on: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 5) {
                Circle().fill(Brand.projectTint(project.index)).frame(width: 7, height: 7)
                Text(project.name).font(.system(size: 12, weight: .medium))
                Text(project.files.formatted())
                    .font(.system(size: 11).monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(Capsule().fill(on ? Color.primary.opacity(0.07) : Color.clear))
            .overlay(Capsule().strokeBorder(Color.primary.opacity(on ? 0 : 0.15), lineWidth: 1))
            .opacity(on ? 1 : 0.55)
        }
        .buttonStyle(.plain)
        .help(on ? "Leave \(project.name) out of this question" : "Include \(project.name) again")
        .accessibilityLabel("\(project.name), \(project.files) files")
        .accessibilityValue(on ? "included" : "left out")
    }
}
