import AppKit
import DigUpKit
import Observation
import Quartz
import SwiftUI

/// The Ask window: a question about your code, the places in your projects that answer it (dug up as you type, on
/// this Mac), and the answer drawn as a figure. The Dock icon shows while it's open, and closing it frees its views.
final class AskWindowController: NSObject, NSWindowDelegate {
    let ask: AskModel
    private unowned let app: AppController
    private var window: QuickLookWindow?
    private var keyMonitor: Any?
    private var mouseMonitor: Any?

    init(app: AppController) {
        self.app = app
        ask = AskModel(engine: app.engine, model: app.model)
    }

    var isVisible: Bool { window?.isVisible == true }

    func show(question: String? = nil) {
        let window = self.window ?? makeWindow()
        if let question { ask.question = question }
        ask.loadProjects()
        app.present(window)
        if !AppController.offscreen { window.makeFirstResponder(ask.field) }
        installKeyMonitor()
    }

    func close() {
        window?.close()
    }

    private func makeWindow() -> QuickLookWindow {
        let window = QuickLookWindow(contentRect: NSRect(x: 0, y: 0, width: 1240, height: 780),
                                     styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                                     backing: .buffered, defer: false)
        // As the search window: an empty unified toolbar makes the title bar tall enough for the question field.
        window.toolbar = NSToolbar(identifier: "GafitasAsk")
        window.toolbarStyle = .unified
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.title = "Ask"
        window.minSize = NSSize(width: 980, height: 620)
        window.isReleasedWhenClosed = false
        window.delegate = self
        if UserDefaults.standard.string(forKey: "defaultsSuite") == nil {
            window.setFrameAutosaveName("GafitasAskWindow")
        }
        window.contentView = NSHostingView(rootView: AskWindowView(ask: ask, model: app.model, app: app))
        if window.frame.origin == .zero { window.center() }
        self.window = window
        return window
    }

    func windowWillClose(_ notification: Notification) {
        if QLPreviewPanel.sharedPreviewPanelExists(), QLPreviewPanel.shared().isVisible {
            QLPreviewPanel.shared().orderOut(nil)
        }
        removeKeyMonitor()
        ask.closeAgent()
        window?.contentView = nil
        window = nil
        app.windowClosed()
    }

    func snapshot(to url: URL) throws {
        try Snapshot.write(window, to: url)
    }

    // MARK: Keys

    private func installKeyMonitor() {
        guard keyMonitor == nil else { return }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, let window else { return event }
            let previewing = QLPreviewPanel.sharedPreviewPanelExists() && QLPreviewPanel.shared().isVisible
                && event.window === QLPreviewPanel.shared() && QLPreviewPanel.shared().dataSource === window
            guard event.window === window || previewing else { return event }
            return handle(event) ? nil : event
        }
        // A click in the question field: the arrows and Space are the text's again.
        mouseMonitor = NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak self] event in
            guard let self, let window, event.window === window, let field = ask.field else { return event }
            if field.bounds.contains(field.convert(event.locationInWindow, from: nil)) { ask.editing() }
            return event
        }
    }

    private func removeKeyMonitor() {
        for monitor in [keyMonitor, mouseMonitor].compactMap({ $0 }) { NSEvent.removeMonitor(monitor) }
        keyMonitor = nil
        mouseMonitor = nil
    }

    /// ↑ ↓ move through the places (and from then on ↩ opens, ⌫ ignores, Space previews); ↩ in the field asks;
    /// ⌘↩ reveals, ⌘C copies the file, ⇧⌘C its lines, ⌘Z brings back what was ignored, ⌘L goes to the question.
    private func handle(_ event: NSEvent) -> Bool {
        if (ask.field?.currentEditor() as? NSTextView)?.hasMarkedText() == true { return false }
        let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            .subtracting([.capsLock, .numericPad, .function])
        let previewing = QLPreviewPanel.sharedPreviewPanelExists() && QLPreviewPanel.shared().isVisible
        let row = ask.selectedRow
        switch event.keyCode {
        case 125, 126 where modifiers.isEmpty:   // ↓ ↑
            ask.move(by: event.keyCode == 125 ? 1 : -1)
        case 36, 76 where modifiers == .option && ask.navigated:   // ⌥↩
            guard let row else { return false }
            ask.adapt(row)
        case 36, 76 where event.window?.firstResponder === ask.followUpField?.currentEditor():   // ↩ in the follow-up
            ask.sendFollowUp()
        case 36, 76:   // ↩
            if modifiers == .command, let row {
                NSWorkspace.shared.activateFileViewerSelecting([row.url])
            } else if modifiers.isEmpty, ask.navigated, let row {
                ask.reuse(row)
            } else if modifiers.isEmpty {
                ask.askNow()
            } else {
                return false
            }
        case 51 where modifiers.isEmpty && ask.navigated:   // ⌫
            guard let row else { return false }
            ask.ignore(row)
        case 6 where modifiers == .command && !ask.ignored.isEmpty && ask.navigated:   // ⌘Z
            ask.undoIgnore()
        case 49 where modifiers.isEmpty && (ask.navigated || previewing) && row != nil:   // Space
            toggleQuickLook()
        case 16 where modifiers == .command:   // ⌘Y
            toggleQuickLook()
        case 38 where modifiers == .command:   // ⌘J
            ask.followUpField?.window?.makeFirstResponder(ask.followUpField)
        case 47 where modifiers == .command && ask.answer == .working:   // ⌘.
            ask.stop()
        case 37 where modifiers == .command:   // ⌘L
            ask.editing()
            ask.focusField()
        case 8 where modifiers == .command && ask.navigated:   // ⌘C
            guard let row else { return false }
            NSPasteboard.general.clearContents()
            NSPasteboard.general.writeObjects([row.url as NSURL])
        case 8 where modifiers == [.command, .shift]:   // ⇧⌘C
            guard let row else { return false }
            ask.copyLines(row)
        case 53:   // Esc
            if previewing {
                QLPreviewPanel.shared().orderOut(nil)
            } else if ask.answer == .working {
                ask.stop()
            } else if !ask.question.isEmpty {
                ask.question = ""
            } else {
                return false
            }
        default:
            return false
        }
        if QLPreviewPanel.sharedPreviewPanelExists(), QLPreviewPanel.shared().isVisible { updateQuickLook() }
        return true
    }

    private func toggleQuickLook() {
        let panel = QLPreviewPanel.shared()!
        if QLPreviewPanel.sharedPreviewPanelExists(), panel.isVisible {
            panel.orderOut(nil)
        } else if ask.selectedRow != nil {
            updateQuickLook()
            panel.makeKeyAndOrderFront(nil)
        }
    }

    private func updateQuickLook() {
        window?.previewURL = ask.selectedRow?.url
        QLPreviewPanel.shared().reloadData()
    }
}

/// A code folder you chose, as the Ask window shows it: a chip with its tint, and the tint of the places dug up in it.
struct Project: Identifiable, Equatable {
    let path: String
    let files: Int
    /// Its place among the code folders: its tint (`Brand.projectTint`).
    let index: Int
    var id: String { path }
    var name: String { (path as NSString).lastPathComponent }
}

/// Where the answer is.
enum AnswerPhase: Equatable {
    case idle
    /// Pi isn't installed.
    case needsPi
    case working
    case done
    case failed(String)
}

/// The model Pi answers with.
struct AgentModel: Equatable {
    let name: String
    let provider: String
    /// It runs on this Mac (nothing is sent anywhere).
    let local: Bool
}

/// The places found in one repo, under its name.
struct PlaceGroup: Identifiable {
    let name: String
    let project: Project?
    let rows: [ResultRow]
    var id: String { name }
}

/// The Ask window's state: the question, the places dug up for it (a pause in typing digs again, on this Mac), which
/// are set aside, and which is selected.
@Observable
final class AskModel {
    var question = "" {
        didSet { if question != oldValue { dig() } }
    }
    /// Code folders whose chip is off: their places are left out.
    var leftOut: Set<String> = [] {
        didSet { if leftOut != oldValue { dig() } }
    }
    private(set) var projects: [Project] = []
    /// The places dug up for the question, best first, minus the ignored ones.
    private(set) var places: [ResultRow] = []
    /// Each place's first line that defines something, by its id, read after the places arrive.
    private(set) var summaries: [String: String] = [:]
    /// Set aside with Ignore (⌫), newest last: ⌘Z brings the last one back.
    private(set) var ignored: [ResultRow] = []
    /// The places are for the question as it is now.
    private(set) var dug = false
    var selection: String? {
        didSet { if selection != oldValue { bridge.select(selection.flatMap { refIDs[$0] }) } }
    }
    /// You moved through the places with the arrow keys since the last edit: ↩, ⌫ and Space act on them then.
    private(set) var navigated = false

    // The answer.
    private(set) var answer = AnswerPhase.idle
    /// What Pi is doing, in a line: "Reading tools/registry.py…", "Answered by DeepSeek V4.1 Flash in 41 s".
    private(set) var progress = ""
    /// The model Pi answers with, once Pi has said.
    private(set) var agentModel: AgentModel?
    /// The question the answer on the sheet is for.
    private(set) var answered = ""
    var followUp = ""
    /// The figure part under the pointer cites this place: its card shows it.
    private(set) var hovered: String?
    /// Waiting for Continue on the privacy sheet: the provider it would go to.
    var confirming: String?

    @ObservationIgnored weak var field: NSTextField?
    @ObservationIgnored weak var followUpField: NSTextField?
    @ObservationIgnored let bridge = AnswerBridge()
    @ObservationIgnored private let agent = AgentRunner()
    @ObservationIgnored private let engine: Engine
    @ObservationIgnored private let model: AppModel
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var task: Task<Void, Never>?
    /// The places the answer may cite, by ref id ("r3", "d1"): what the page draws and what a click may open.
    @ObservationIgnored private var refs: [String: [String: Any]] = [:]
    /// A place's ref id, by its row id.
    @ObservationIgnored private var refIDs: [String: String] = [:]
    @ObservationIgnored private var answerWhenDug = false
    @ObservationIgnored private var pending: String?
    @ObservationIgnored private var repairing = false
    @ObservationIgnored private var repaired = false
    @ObservationIgnored private var repair = ""
    @ObservationIgnored private var drawing = false
    @ObservationIgnored private var started = Date()

    /// At most this many places: what fits the column, and what an answer can cite.
    static let placeLimit = 15
    /// A question can be about two projects at once, and then neither side stands out at the usual 2
    /// (evals/prior-art.json: two-project questions 3 of 6 in the top 5 at 2.0, 5 of 6 at 1.5).
    static let zGate = 1.5

    init(engine: Engine, model: AppModel) {
        self.engine = engine
        self.model = model
        agent.onEvent = { [weak self] in self?.received($0) }
        bridge.onMessage = { [weak self] in self?.page($0) }
    }

    var trimmed: String { question.trimmingCharacters(in: .whitespacesAndNewlines) }
    var selectedRow: ResultRow? { places.first { $0.id == selection } ?? places.first }

    /// The places, one group per repo in the order of its best place.
    var groups: [PlaceGroup] {
        var order: [String] = []
        var byName: [String: [ResultRow]] = [:]
        for row in places {
            let name = repoName(row)
            if byName[name] == nil { order.append(name) }
            byName[name, default: []].append(row)
        }
        return order.map { PlaceGroup(name: $0, project: project(of: byName[$0]![0]), rows: byName[$0]!) }
    }

    /// "15 places in 2 projects".
    var summary: String {
        let repos = Set(places.map(repoName)).count
        return (places.count == 1 ? "1 place" : "\(places.count) places")
            + " in " + (repos == 1 ? "1 project" : "\(repos) projects")
    }

    /// The code folder a place is in.
    func project(of row: ResultRow) -> Project? {
        projects.filter { row.url.path.hasPrefix($0.path + "/") }.max { $0.path.count < $1.path.count }
    }

    /// The repo a place is in ("hermes-agent"), else its code folder's name.
    func repoName(_ row: ResultRow) -> String {
        row.info["repo"].map { ($0 as NSString).lastPathComponent } ?? project(of: row)?.name ?? row.folder
    }

    /// Its path inside its repo: "tools/registry.py".
    func pathInRepo(_ row: ResultRow) -> String {
        if let repo = row.info["repo"], row.url.path.hasPrefix(repo + "/") {
            return String(row.url.path.dropFirst(repo.count + 1))
        }
        return row.name
    }

    func loadProjects() {
        Task {
            let summaries = await engine.rootSummaries(code: true)
            projects = summaries.enumerated().map { Project(path: $1.path, files: $1.indexed, index: $0) }
        }
    }

    func toggle(_ project: Project) {
        if leftOut.contains(project.path) { leftOut.remove(project.path) } else { leftOut.insert(project.path) }
    }

    func select(_ row: ResultRow) {
        selection = row.id
        navigated = true
    }

    func editing() {
        navigated = false
    }

    func focusField() {
        guard let field, field.currentEditor() == nil else { return }
        field.window?.makeFirstResponder(field)
    }

    func move(by step: Int) {
        let ids = places.map(\.id)
        guard !ids.isEmpty else { return }
        let index = selection.flatMap { ids.firstIndex(of: $0) } ?? -1
        selection = ids[max(0, min(ids.count - 1, index + step))]
        navigated = true
    }

    /// Reuse: the code in your editor, at the line.
    func reuse(_ row: ResultRow) {
        engine.open(row)
    }

    func ignore(_ row: ResultRow) {
        guard let index = places.firstIndex(where: { $0.id == row.id }) else { return }
        if let id = refIDs[row.id] { agent.steer("Set aside \(id): the user says it doesn't fit.") }
        places.remove(at: index)
        ignored.append(row)
        if selection == row.id { selection = places[safe: min(index, places.count - 1)]?.id }
    }

    func undoIgnore() {
        guard let row = ignored.popLast() else { return }
        places.append(row)
        places.sort { ($0.z ?? 0) > ($1.z ?? 0) }
        selection = row.id
    }

    /// The place's lines, headed by where they're from, for pasting into a chat or a note.
    func copyLines(_ row: ResultRow) {
        Task {
            guard let text = await engine.text(ofSegment: row.segmentID, code: true) else { return }
            let place = "\(repoName(row))/\(pathInRepo(row)):\(Int(row.loc ?? 1))"
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString("// \(place)\n\(text)", forType: .string)
        }
    }

    /// ↩ in the question field: the places at once (without waiting for the typing pause), then the answer.
    func askNow() {
        guard !trimmed.isEmpty else { return }
        if dug || !engine.hasCode {
            startAnswer()
        } else {
            answerWhenDug = true
            dig(now: true)
        }
    }

    /// Adapt…: a follow-up about making this place fit, ready to send.
    func adapt(_ row: ResultRow) {
        let id = refIDs[row.id].map { " (\($0))" } ?? ""
        followUp = "How would I adapt \(summaries[row.id] ?? row.name)\(id) for this?"
        followUpField?.window?.makeFirstResponder(followUpField)
    }

    func sendFollowUp() {
        let text = followUp.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, agent.isRunning else { return }
        followUp = ""
        begin(text, fresh: false)
    }

    func stop() {
        agent.abort()
    }

    func closeAgent() {
        agent.stop()
    }

    func approve(_ provider: String, always: Bool) {
        if always {
            UserDefaults.standard.set(Array(Set(Self.approvedProviders + [provider])), forKey: "approvedProviders")
        }
        confirming = nil
        if let pending { send(pending, fresh: true) }
        pending = nil
    }

    func cancelConfirm() {
        confirming = nil
        pending = nil
        answer = .idle
    }

    private static var approvedProviders: [String] {
        UserDefaults.standard.stringArray(forKey: "approvedProviders") ?? []
    }

    // MARK: The answer

    /// Pi, the places as refs, and the question: the privacy sheet first when the model isn't on this Mac.
    private func startAnswer() {
        guard let pi = AgentRunner.locate() else {
            answer = .needsPi
            return
        }
        answered = trimmed
        let roots = model.settings.codeRoots.filter { !leftOut.contains($0.path) }
        do {
            try agent.start(pi: pi, roots: roots, index: model.settings.indexDirectory,
                            models: model.settings.modelsDirectory)
        } catch {
            answer = .failed("Pi didn't start: \(error.localizedDescription)")
            return
        }
        answer = .working
        progress = "Reading the places it found…"
        let places = self.places, question = trimmed
        Task {
            refs = [:]
            refIDs = [:]
            var list: [[String: Any]] = []
            for (index, row) in places.enumerated() {
                let id = "r\(index + 1)"
                guard let text = await engine.text(ofSegment: row.segmentID, code: true) else { continue }
                let ref = ref(id: id, row: row, text: text)
                refs[id] = ref
                refIDs[row.id] = id
                list.append(ref)
            }
            bridge.reset()
            bridge.refs(list.map(Self.forPage))
            bridge.select(selection.flatMap { refIDs[$0] })
            begin(Self.prompt(question, refs: list), fresh: true)
        }
    }

    /// Sends it once the model is known and allowed: a model off this Mac needs a yes first (once per provider).
    private func begin(_ prompt: String, fresh: Bool) {
        guard let agentModel else {
            pending = prompt
            return
        }
        if !agentModel.local, !Self.approvedProviders.contains(agentModel.provider), fresh {
            pending = prompt
            confirming = agentModel.provider
            return
        }
        send(prompt, fresh: fresh)
    }

    private func send(_ prompt: String, fresh: Bool) {
        if !fresh { bridge.reset() }
        answer = .working
        repaired = false
        repairing = false
        drawing = false
        started = Date()
        if fresh { agent.ask(prompt) } else { agent.followUp(prompt) }
    }

    private func ref(id: String, row: ResultRow, text: String) -> [String: Any] {
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false)
        let first = Int(row.loc ?? 1)
        return ["id": id, "repo": repoName(row), "path": pathInRepo(row), "file": row.url.path, "first": first,
                "last": first + min(lines.count, Self.refLines) - 1, "focus": Int(row.focus ?? row.loc ?? 1),
                "summary": summaries[row.id] ?? CodeExtractor.summary(text),
                "text": lines.prefix(Self.refLines).joined(separator: "\n"), "tint": project(of: row)?.index ?? 3]
    }

    /// What the page gets of a ref: everything but where the file is on this Mac.
    private static func forPage(_ ref: [String: Any]) -> [String: Any] {
        ref.filter { $0.key != "file" }
    }

    /// At most this many lines of each place go to the model and the page.
    static let refLines = 40

    private static func prompt(_ question: String, refs: [[String: Any]]) -> String {
        var text = "Question: \(question)\n\n"
        if refs.isEmpty {
            text += "Gafitas found no places in the user's projects for this. Answer from what you know, with concept parts.\n"
        } else {
            text += "Places Gafitas dug up in the user's projects (cite them by id):\n"
            for ref in refs {
                text += "\n\(ref["id"]!) · \(ref["repo"]!)/\(ref["path"]!), lines \(ref["first"]!)-\(ref["last"]!) "
                    + "(\(ref["file"]!))\n\(ref["text"]!)\n"
            }
        }
        return text
    }

    private func received(_ event: AgentRunner.Event) {
        switch event {
        case .model(let name, let provider, let local):
            agentModel = AgentModel(name: name, provider: provider, local: local)
            if let pending, confirming == nil {
                self.pending = nil
                begin(pending, fresh: true)
            }
        case .progress(let line):
            progress = line
        case .program(let text):
            if repairing {
                repair += text
            } else {
                if !drawing { progress = "Drawing the answer…" }
                drawing = true
                bridge.append(text)
            }
        case .refs(let found):
            let roots = model.settings.codeRoots.map(\.path), skipped = model.settings.codeExcluded.map(\.path)
            var added: [[String: Any]] = []
            for var ref in found {
                // The extension checked them; the app checks again before the page may open one.
                guard let id = ref["id"] as? String, let file = ref["file"] as? String,
                      FolderSelection.isSearched(file, folders: roots, skipped: skipped) else { continue }
                ref["tint"] = projects.filter { file.hasPrefix($0.path + "/") }.map(\.index).first ?? 3
                refs[id] = ref
                added.append(ref)
            }
            if !added.isEmpty {
                bridge.refs(added.map(Self.forPage))
                let repos = Set(added.compactMap { $0["repo"] as? String }).sorted()
                progress = "Found \(added.count) more \(added.count == 1 ? "place" : "places") in "
                    + repos.formatted(.list(type: .and))
            }
        case .finished:
            if repairing {
                repairing = false
                bridge.replace(repair)
            } else if answer == .working {
                bridge.done()
            }
        case .failed(let problem):
            answer = .failed(problem)
            log("ask: answer failed: \(problem)")
        }
    }

    /// The page: a figure part opened, hovered or adapted, or what it couldn't draw.
    private func page(_ message: [String: Any]) {
        switch message["type"] as? String {
        case "open":
            guard let id = message["ref"] as? String, let ref = refs[id], let file = ref["file"] as? String else { return }
            CodeEditor.current.open(URL(fileURLWithPath: file), line: message["line"] as? Int ?? ref["focus"] as? Int ?? 1)
        case "hover":
            hovered = (message["ref"] as? String).flatMap { id in refIDs.first { $0.value == id }?.key }
        case "adapt":
            let id = message["ref"] as? String ?? ""
            followUp = "How would I adapt \(id)\((message["path"] as? String).map { " into \($0)" } ?? "")?"
            followUpField?.window?.makeFirstResponder(followUpField)
        case "errors":
            let errors = message["errors"] as? [[String: Any]] ?? []
            if !errors.isEmpty, !repaired, agent.isRunning {
                repaired = true
                repairing = true
                repair = ""
                progress = "Fixing \(errors.count == 1 ? "a mistake" : "\(errors.count) mistakes") in the drawing…"
                let lines = errors.map { "\($0["id"] as? String ?? "?"): \($0["message"] as? String ?? "")" }
                agent.followUp("Reply with only the corrected statements, same ids:\n" + lines.joined(separator: "\n"))
                return
            }
            answer = .done
            let seconds = Int(Date().timeIntervalSince(started).rounded())
            progress = "Answered by \(agentModel?.name ?? "the model") in \(seconds) s"
            log("ask: answered in \(seconds) s, \(errors.count) left undrawn")
        default:
            break
        }
    }

    private func dig(now: Bool = false) {
        generation += 1
        let current = generation
        task?.cancel()
        navigated = false
        dug = false
        let text = trimmed
        guard !text.isEmpty else {
            places = []
            ignored = []
            return
        }
        guard engine.hasCode else { return }
        engine.prewarm()
        engine.embedAhead(text, code: true)
        let skipped = leftOut
        let showAt = ContinuousClock.now + (now ? .zero : SearchPanelController.typingPause)
        task = Task {
            let vector = await engine.embedQuery(text, code: true)
            guard !Task.isCancelled, current == generation else { return }
            let hits = await engine.search(text, vector: vector, prefixLast: false, limit: 40, code: true,
                                           zGate: Self.zGate)
            try? await Task.sleep(until: showAt, tolerance: .milliseconds(1), clock: .continuous)
            guard !Task.isCancelled, current == generation else { return }
            let terms = Searcher.terms(text)
            let rows = hits.map { ResultRow($0, terms: terms) }.filter { row in
                !skipped.contains { row.url.path.hasPrefix($0 + "/") }
            }
            places = Array(rows.prefix(Self.placeLimit))
            ignored = []
            if !places.contains(where: { $0.id == selection }) { selection = places.first?.id }
            dug = true
            if answerWhenDug {
                answerWhenDug = false
                startAnswer()
            }
            for row in places where summaries[row.id] == nil {
                guard let text = await engine.text(ofSegment: row.segmentID, code: true), current == generation
                else { continue }
                summaries[row.id] = CodeExtractor.summary(text)
            }
            log("ask: \"\(text)\": \(places.count) places in \(Set(places.map(repoName)).count) repos")
        }
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
