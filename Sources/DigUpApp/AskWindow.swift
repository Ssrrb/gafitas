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
    var selection: String?
    /// You moved through the places with the arrow keys since the last edit: ↩, ⌫ and Space act on them then.
    private(set) var navigated = false
    @ObservationIgnored weak var field: NSTextField?
    @ObservationIgnored private let engine: Engine
    @ObservationIgnored private let model: AppModel
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var task: Task<Void, Never>?

    /// At most this many places: what fits the column, and what an answer can cite.
    static let placeLimit = 15
    /// A question can be about two projects at once, and then neither side stands out at the usual 2
    /// (evals/prior-art.json: two-project questions 3 of 6 in the top 5 at 2.0, 5 of 6 at 1.5).
    static let zGate = 1.5

    init(engine: Engine, model: AppModel) {
        self.engine = engine
        self.model = model
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

    /// ↩ in the question field: the places at once, without waiting for the typing pause.
    func askNow() {
        guard !trimmed.isEmpty else { return }
        if !dug { dig(now: true) }
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
