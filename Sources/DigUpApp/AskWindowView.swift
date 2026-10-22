import AppKit
import DigUpKit
import SwiftUI

/// The question on top with a chip per code folder; the places dug up for it on the left, grouped by repo; the answer
/// on an opaque sheet on the right; what's indexed at the bottom.
struct AskWindowView: View {
    @Bindable var ask: AskModel
    let model: AppModel
    let app: AppController
    @State private var fieldFocused = false

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            HStack(spacing: 0) {
                PlacesColumn(ask: ask, model: model)
                    .frame(width: 368)
                Divider()
                AnswerSheet(ask: ask, model: model, app: app)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(nsColor: .textBackgroundColor))
            }
            Divider()
            statusBar
        }
        .ignoresSafeArea(.container, edges: .top)
        .frame(minWidth: 980, minHeight: 620)
        .sheet(item: Binding(get: { ask.confirming.map(Provider.init) }, set: { if $0 == nil { ask.confirming = nil } })) {
            PrivacySheet(ask: ask, provider: $0.name)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                HStack(spacing: 9) {
                    Image(systemName: "eyeglasses")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.gradient)
                        .frame(width: 22)
                    SearchField(text: $ask.question, fontSize: 18, placeholder: placeholder,
                                onMake: { ask.field = $0 }, onFocus: { fieldFocused = $0 })
                    if !ask.question.isEmpty {
                        Button {
                            ask.question = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary)
                        }
                        .buttonStyle(.plain)
                        .help("Clear")
                    }
                }
                .padding(.horizontal, 12)
                .frame(height: 38)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.primary.opacity(0.06)))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(Color.accentColor.opacity(fieldFocused ? 0.6 : 0), lineWidth: 2))
                .animation(.easeOut(duration: 0.15), value: fieldFocused)
                Button {
                    app.showSettings(.code)
                } label: {
                    Image(systemName: "gearshape")
                        .font(.system(size: 15))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("Settings (⌘,)")
            }
            .padding(.leading, 78)   // beside the window buttons
            .frame(height: 52)
            HStack(spacing: 6) {
                ForEach(ask.projects) { project in
                    ProjectChip(project: project, on: !ask.leftOut.contains(project.path)) { ask.toggle(project) }
                }
                Button("Add Project…") { app.chooseCodeFolders() }
                    .buttonStyle(.plain)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 6)
            }
            .frame(height: 24)
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 10)
    }

    private var placeholder: String {
        model.hasCode ? "Ask how something works: “how do I connect skill creation to my harness?”"
            : "Ask how something works: “how does a hash map grow?”"
    }

    private var statusBar: some View {
        HStack(spacing: 10) {
            if model.status.code.indexing != nil, let progress = model.progress {
                ProgressView(value: progress).progressViewStyle(.circular).controlSize(.mini)
            }
            Button(model.codeStatusLine) { app.showSettings(.code) }
                .buttonStyle(.plain)
                .lineLimit(1)
                .help("Code folders and indexing")
            Spacer()
            if let agent = ask.agentModel {
                Text("Answers by \(agent.name) " + (agent.local ? "on this Mac" : "via \(PrivacySheet.title(agent.provider))"))
                    .lineLimit(1)
            }
        }
        .font(.system(size: 11))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 14)
        .frame(height: 28)
    }
}

/// The places dug up for the question, grouped by repo, best repo first.
private struct PlacesColumn: View {
    @Bindable var ask: AskModel
    let model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let caveat {
                Text(caveat)
                    .font(.system(size: 11))
                    .foregroundStyle(.orange)
                    .padding(.horizontal, 14)
                    .padding(.top, 10)
            }
            if ask.trimmed.isEmpty || !model.hasCode {
                Text("The places in your projects that answer it show here, found on this Mac.")
                    .font(.system(size: 12))
                    .foregroundStyle(.tertiary)
                    .padding(14)
                Spacer()
            } else if !ask.dug {
                ProgressView().controlSize(.small).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if ask.places.isEmpty {
                PlacesEmpty(ignored: ask.ignored.count, undo: ask.undoIgnore)
            } else {
                list
            }
        }
    }

    private var caveat: String? {
        guard let indexing = model.status.code.indexing, indexing.total > 0 else { return nil }
        let percent = Int((Double(indexing.done) / Double(indexing.total) * 100).rounded(.down))
        return "Still reading code (\(percent)%): some of it isn't in yet."
    }

    private var list: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    Text(ask.summary)
                        .font(.system(size: 13, weight: .semibold))
                        .padding(.horizontal, 4)
                    ForEach(ask.groups) { group in
                        HStack(spacing: 6) {
                            Circle().fill(Brand.projectTint(group.project?.index ?? 99)).frame(width: 7, height: 7)
                            Text(group.name).font(.system(size: 12, weight: .semibold))
                            Text("· \(group.rows.count == 1 ? "1 place" : "\(group.rows.count) places")")
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 4)
                        .padding(.top, 8)
                        .accessibilityAddTraits(.isHeader)
                        ForEach(group.rows) { row in
                            PriorArtCard(row: row, summary: ask.summaries[row.id], path: ask.pathInRepo(row),
                                         selected: row.id == ask.selectedRow?.id,
                                         reuse: { ask.reuse(row) }, adapt: { ask.adapt(row) }, ignore: { ask.ignore(row) })
                                .id(row.id)
                                .onTapGesture(count: 2) { ask.reuse(row) }
                                .onTapGesture { ask.select(row) }
                        }
                    }
                    if !ask.ignored.isEmpty {
                        Button("\(ask.ignored.count) ignored · Undo (⌘Z)") { ask.undoIgnore() }
                            .buttonStyle(.plain)
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 4)
                            .padding(.top, 6)
                    }
                }
                .padding(10)
                .animation(.easeOut(duration: 0.15), value: ask.selectedRow?.id)
            }
            .onChange(of: ask.selection) {
                if let id = ask.selection { withAnimation(.easeOut(duration: 0.15)) { proxy.scrollTo(id) } }
            }
        }
    }
}

/// Nothing close enough in the code folders.
private struct PlacesEmpty: View {
    let ignored: Int
    let undo: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(ignored > 0 ? "You set aside every place" : "Nothing in your projects matches this closely")
                .font(.system(size: 13, weight: .semibold))
            Text(ignored > 0 ? "The answer will leave them out."
                 : "The answer will come from what the model knows. If you meant your code, name a function or file in it.")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if ignored > 0 { Button("Undo (⌘Z)", action: undo).controlSize(.small).padding(.top, 4) }
            Spacer()
        }
        .padding(14)
    }
}
