import AppKit
import DigUpKit
import Observation
import SwiftUI

/// The Ask window: a question about your code, and the answer drawn as the pieces of code that fit together. Every
/// question is a chat, kept in the history on the left; the places in your projects that answer it are dug up as you
/// type, on this Mac. The Dock icon shows while it's open, and closing it frees its views.
final class AskWindowController: NSObject, NSWindowDelegate {
    let ask: AskModel
    private unowned let app: AppController
    private var window: NSWindow?
    private var keyMonitor: Any?

    init(app: AppController) {
        self.app = app
        ask = AskModel(engine: app.engine, model: app.model, chatLog: app.chatLog)
    }

    var isVisible: Bool { window?.isVisible == true }

    func show(question: String? = nil) {
        let window = self.window ?? makeWindow()
        if let question, !ask.working {
            ask.newQuestion()
            ask.question = question
        }
        ask.loadProjects()
        ask.refreshHistory()
        app.present(window)
        if !AppController.offscreen { ask.focusField() }
        installKeyMonitor()
    }

    func close() {
        window?.close()
    }

    private func makeWindow() -> NSWindow {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1240, height: 780),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                              backing: .buffered, defer: false)
        // An empty unified toolbar makes the title bar as tall as the top bar.
        window.toolbar = NSToolbar(identifier: "GafitasAsk")
        window.toolbarStyle = .unified
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.title = "Gafitas"
        window.minSize = NSSize(width: 980, height: 620)
        window.isReleasedWhenClosed = false
        window.delegate = self
        if UserDefaults.standard.string(forKey: "defaultsSuite") == nil {
            window.setFrameAutosaveName("GafitasAskWindow")
        }
        window.contentView = NSHostingView(rootView: AskWindowView(ask: ask, model: app.model, app: app))
        // For snapshots at the smallest size: -debugWindowSize 980x620 (after the content, which sizes the window).
        if let size = UserDefaults.standard.string(forKey: "debugWindowSize")?.split(separator: "x").compactMap({ Double($0) }),
           size.count == 2 {
            window.setContentSize(NSSize(width: size[0], height: size[1]))
        }
        if window.frame.origin == .zero { window.center() }
        self.window = window
        return window
    }

    func windowWillClose(_ notification: Notification) {
        removeKeyMonitor()
        ask.closeAgent()
        window?.contentView = nil
        window = nil
        app.windowClosed()
    }

    /// The window into a PNG, the answer page in it too once `answerShot` holds the web view's own picture.
    func snapshot(to url: URL) throws {
        let web = ask.bridge.webView
        try Snapshot.write(window, to: url, overlay: answerShot.flatMap { web.window == nil ? nil : ($0, web) })
    }

    /// The answer page as WebKit draws it, for `snapshot` (`-debugAskAnswer`).
    var answerShot: NSImage?
    /// The whole page, below the fold too.
    var pageShot: NSImage?

    func captureAnswer(then done: @escaping () -> Void) {
        ask.bridge.webView.takeSnapshot(with: nil) { [weak self] image, error in
            if let error { log("ask: answer snapshot failed: \(error)") }
            self?.answerShot = image
            self?.ask.bridge.capturePage { page in
                self?.pageShot = page
                done()
            }
        }
    }

    // MARK: Keys

    private func installKeyMonitor() {
        guard keyMonitor == nil else { return }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, let window, event.window === window else { return event }
            return handle(event) ? nil : event
        }
    }

    private func removeKeyMonitor() {
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
        keyMonitor = nil
    }

    /// ↩ asks (in the question field) or follows up (in the composer); ⌘. and Esc stop; ⌘L goes to the field; ⌘[ ⌘]
    /// move through the history; ⌘⌫ deletes the chat when no text is being edited. The menus have the rest.
    private func handle(_ event: NSEvent) -> Bool {
        let editor = window?.firstResponder as? NSTextView
        if editor?.hasMarkedText() == true { return false }
        let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            .subtracting([.capsLock, .numericPad, .function])
        switch (event.keyCode, modifiers) {
        case (36, []), (76, []):   // ↩
            if let editor, editor === ask.followUpField?.currentEditor() {
                ask.sendFollowUp()
            } else if let editor, editor === ask.field?.currentEditor() {
                ask.askNow()
            } else {
                return false
            }
        case (47, .command):   // ⌘.
            guard ask.working else { return false }
            ask.stop()
        case (53, []):   // Esc
            if ask.working {
                ask.stop()
            } else if ask.chat == nil, !ask.question.isEmpty {
                ask.question = ""
            } else {
                return false
            }
        case (37, .command):   // ⌘L
            ask.focusField()
        case (33, .command), (30, .command):   // ⌘[ ⌘]
            ask.stepChat(by: event.keyCode == 33 ? -1 : 1)
        case (51, .command) where editor == nil:   // ⌘⌫
            guard let chat = ask.chat else { return false }
            ask.confirmDelete(chat.id)
        default:
            return false
        }
        return true
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

/// The Ask window's state: the question on the home screen and the places dug up for it (a pause in typing digs
/// again, on this Mac), the chat on the sheet, the history, and what Pi is doing for the turn it's answering.
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
    /// The places dug up for the question, best first.
    private(set) var places: [ResultRow] = []
    /// Each place's first line that defines something, by its id, read after the places arrive.
    private(set) var summaries: [String: String] = [:]
    /// The places are for the question as it is now.
    private(set) var dug = false

    /// The chat on the sheet; nil on the home screen.
    private(set) var chat: Chat?
    private(set) var history: [ChatSummary] = []
    var historyQuery = ""
    var sidebarShown = true
    private(set) var answer = AnswerPhase.idle
    /// The model Pi answers with, once Pi has said.
    private(set) var agentModel: AgentModel?
    var followUp = ""
    /// Waiting for Continue on the privacy sheet: the provider it would go to.
    var confirming: String?
    /// The question being answered (a new chat's title before it's saved).
    private(set) var asking = ""

    @ObservationIgnored weak var field: NSTextField?
    @ObservationIgnored weak var followUpField: NSTextField?
    @ObservationIgnored weak var historyField: NSTextField?
    @ObservationIgnored let bridge = AnswerBridge()
    @ObservationIgnored private let agent = AgentRunner()
    @ObservationIgnored private let engine: Engine
    @ObservationIgnored private let model: AppModel
    @ObservationIgnored private let chatLog: ChatLog
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var task: Task<Void, Never>?
    /// The places the answer may cite, by ref id ("r3", "d1"): what the page draws and what a click may open.
    @ObservationIgnored private var refs: [String: [String: Any]] = [:]
    @ObservationIgnored private var answerWhenDug = false
    @ObservationIgnored private var pending: String?
    /// The chat whose conversation Pi's session holds: a follow-up there goes straight on; anywhere else it starts a
    /// session that's told the chat so far.
    @ObservationIgnored private var sessionChat: String?

    // The turn being answered.
    @ObservationIgnored private var turnID = ""
    @ObservationIgnored private var turnQuestion = ""
    @ObservationIgnored private var trail: [[String: Any]] = []
    @ObservationIgnored private var trailSummary: String?
    @ObservationIgnored private var thinking = ""
    @ObservationIgnored private var narration = ""
    @ObservationIgnored private var thoughtShownAt = Date.distantPast
    @ObservationIgnored private var filesRead = 0
    @ObservationIgnored private var repairing = false
    @ObservationIgnored private var repaired = false
    @ObservationIgnored private var stopped = false
    @ObservationIgnored private var repair = ""
    @ObservationIgnored private var drawing = false
    @ObservationIgnored private var started = Date()
    @ObservationIgnored private var announcedAt = Date.distantPast
    /// The program as it streamed (what's saved if the page never reports the repaired one).
    @ObservationIgnored private var streamed = ""

    /// At most this many places: what an answer can cite.
    static let placeLimit = 15
    /// A question can be about two projects at once, and then neither side stands out at the usual 2
    /// (evals/prior-art.json: two-project questions 3 of 6 in the top 5 at 2.0, 5 of 6 at 1.5).
    static let zGate = 1.5
    static let es = Locale(identifier: "es")

    init(engine: Engine, model: AppModel, chatLog: ChatLog) {
        self.engine = engine
        self.model = model
        self.chatLog = chatLog
        agent.onEvent = { [weak self] in self?.received($0) }
        bridge.onMessage = { [weak self] in self?.page($0) }
    }

    var trimmed: String { question.trimmingCharacters(in: .whitespacesAndNewlines) }
    var working: Bool { answer == .working }

    /// "8 lugares en requests y urllib3".
    var placesLine: String {
        let repos = orderedRepos(places)
        return repos.isEmpty ? placesCount(places.count) : "\(placesCount(places.count)) en \(Self.list(repos))"
    }

    /// History rows matching the search field (questions and project names).
    var shownHistory: [ChatSummary] {
        let query = historyQuery.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return history }
        return history.filter { summary in
            ([summary.title] + summary.projects).contains {
                $0.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) != nil
            }
        }
    }

    /// What the privacy sheet says goes to the model: the places, their lines, their projects.
    var sending: (places: Int, lines: Int, repos: [String]) {
        let lines = refs.values.reduce(0) { $0 + (($1["last"] as? Int ?? 0) - ($1["first"] as? Int ?? 0) + 1) }
        return (refs.count, lines, chat?.projects ?? [])
    }

    static func list(_ items: [String]) -> String { items.formatted(.list(type: .and).locale(es)) }

    private func placesCount(_ count: Int) -> String { count == 1 ? "1 lugar" : "\(count) lugares" }

    /// The code folder a place is in.
    func project(of row: ResultRow) -> Project? {
        projects.filter { row.url.path.hasPrefix($0.path + "/") }.max { $0.path.count < $1.path.count }
    }

    /// The repo a place is in ("hermes-agent"), else its code folder's name.
    func repoName(_ row: ResultRow) -> String {
        row.info["repo"].map { ($0 as NSString).lastPathComponent } ?? project(of: row)?.name ?? row.folder
    }

    private func orderedRepos(_ rows: [ResultRow]) -> [String] {
        var seen: [String] = []
        for row in rows where !seen.contains(repoName(row)) { seen.append(repoName(row)) }
        return seen
    }

    /// Its path inside its repo: "tools/registry.py".
    func pathInRepo(_ row: ResultRow) -> String {
        if let repo = row.info["repo"], row.url.path.hasPrefix(repo + "/") {
            return String(row.url.path.dropFirst(repo.count + 1))
        }
        return row.name
    }

    /// A project's tint by its name, for the history's dots.
    func tint(ofRepo name: String) -> Color {
        Brand.projectTint(projects.first { $0.name == name }?.index ?? 99)
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

    func focusField() {
        let target = chat == nil ? field : followUpField
        guard let target, target.currentEditor() == nil else { return }
        target.window?.makeFirstResponder(target)
    }

    func focusHistorySearch() {
        sidebarShown = true
        DispatchQueue.main.async { [weak self] in
            guard let field = self?.historyField else { return }
            field.window?.makeFirstResponder(field)
        }
    }

    // MARK: Chats

    func refreshHistory() {
        history = chatLog.list()
    }

    /// ⌘N: back to the home screen. Not while Pi answers: it runs one conversation at a time.
    func newQuestion() {
        guard !working else { return }
        chat = nil
        answer = .idle
        question = ""
        followUp = ""
        refs = [:]
        bridge.reset()
        DispatchQueue.main.async { [weak self] in self?.focusField() }
    }

    /// A saved chat, drawn from the log at once: no Pi, no model call.
    func open(chat id: String) {
        guard !working, chat?.id != id, let saved = chatLog.load(id) else { return }
        chat = saved
        refs = Dictionary(saved.refs.compactMap { ref in (ref["id"] as? String).map { ($0, ref) } }) { a, _ in a }
        answer = saved.turns.last.map { $0.outcome.hasPrefix("failed") ? .failed($0.outcome) : .done } ?? .done
        followUp = ""
        bridge.reset()
        bridge.refs(saved.refs.map(Self.forPage))
        bridge.load(saved.turns.enumerated().map { index, turn in
            ["id": "t\(index + 1)", "question": turn.question, "program": turn.program,
             "trail": ["lines": turn.trail.map(Self.line), "summary": turn.summary, "thinking": turn.thinking]]
        })
        DispatchQueue.main.async { [weak self] in self?.focusField() }
    }

    /// ⌘[ ⌘]: the chat above or below in the history.
    func stepChat(by step: Int) {
        let list = shownHistory
        guard !list.isEmpty, !working else { return }
        let index = chat.flatMap { current in list.firstIndex { $0.id == current.id } } ?? (step > 0 ? -1 : list.count)
        let next = index + step
        guard list.indices.contains(next) else { return }
        open(chat: list[next].id)
    }

    func confirmDelete(_ id: String) {
        guard !(working && chat?.id == id) else { return }
        let questions = history.first { $0.id == id }?.questions ?? chat?.turns.count ?? 1
        let alert = NSAlert()
        alert.messageText = "¿Eliminar esta conversación?"
        alert.informativeText = questions == 1
            ? "Se borra de este Mac su pregunta y su respuesta. No se puede deshacer."
            : "Se borran de este Mac sus \(questions) preguntas y respuestas. No se puede deshacer."
        alert.addButton(withTitle: "Eliminar").hasDestructiveAction = true
        alert.addButton(withTitle: "Cancelar")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        chatLog.delete(id)
        if chat?.id == id { newQuestion() }
        refreshHistory()
    }

    // MARK: Asking

    /// ↩ on the home screen: the places at once (without waiting for the typing pause), then the answer.
    func askNow() {
        guard chat == nil, !working, !trimmed.isEmpty else { return }
        if dug || !engine.hasCode {
            startAnswer()
        } else {
            answerWhenDug = true
            dig(now: true)
        }
    }

    /// The composer: a follow-up in this chat. In a reopened chat, Pi gets the chat so far first.
    func sendFollowUp() {
        let text = followUp.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !working, let chat else { return }
        guard let pi = AgentRunner.locate() else {
            answer = .needsPi
            return
        }
        followUp = ""
        turnQuestion = text
        if sessionChat == chat.id, agent.isRunning {
            beginTurn(text)
            begin(text, fresh: false)
            return
        }
        // A new process, told to number its places after the ones this chat already cites.
        closeAgent()
        guard startPi(pi) else { return }
        beginTurn(text, continuing: true)
        begin(Self.continuation(chat, question: text), fresh: true)
    }

    func stop() {
        stopped = true
        agent.abort()
    }

    func closeAgent() {
        agent.stop()
        sessionChat = nil
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
        finishTurn(.stopped)
    }

    private static var approvedProviders: [String] {
        UserDefaults.standard.stringArray(forKey: "approvedProviders") ?? []
    }

    /// The first question: a new chat, its places as refs, then Pi.
    private func startAnswer() {
        guard let pi = AgentRunner.locate() else {
            answer = .needsPi
            return
        }
        let places = self.places, asked = trimmed
        answer = .working
        Task {
            refs = [:]
            var list: [[String: Any]] = []
            for (index, row) in places.enumerated() {
                let id = "r\(index + 1)"
                guard let text = await engine.text(ofSegment: row.segmentID, code: true) else { continue }
                let ref = ref(id: id, row: row, text: text)
                refs[id] = ref
                list.append(ref)
            }
            chat = Chat(id: ChatLog.newID(), created: Date(), projects: orderedRepos(places), refs: list, turns: [])
            bridge.reset()
            bridge.refs(list.map(Self.forPage))
            question = ""
            turnQuestion = asked
            guard startPi(pi) else { return }
            beginTurn(asked)
            begin(Self.prompt(asked, refs: list), fresh: true)
        }
    }

    private func startPi(_ pi: URL) -> Bool {
        let roots = model.settings.codeRoots.filter { !leftOut.contains($0.path) }
        do {
            let digFrom = refs.keys.compactMap { $0.hasPrefix("d") ? Int($0.dropFirst()) : nil }.max() ?? 0
            try agent.start(pi: pi, roots: roots, index: model.settings.indexDirectory,
                            models: model.settings.modelsDirectory, digFrom: digFrom)
            return true
        } catch {
            beginTurn(turnQuestion)
            finishTurn(.failed("Pi no arrancó: \(error.localizedDescription)"))
            return false
        }
    }

    /// A new turn on the page: its heading, and the trail's first lines.
    private func beginTurn(_ text: String, continuing: Bool = false) {
        guard let chat else { return }
        turnQuestion = text
        asking = text
        turnID = "t\(chat.turns.count + 1)"
        trail = []
        trailSummary = nil
        thinking = ""
        narration = ""
        filesRead = 0
        repairing = false
        repaired = false
        stopped = false
        drawing = false
        streamed = ""
        started = Date()
        answer = .working
        bridge.turn(turnID, question: text)
        if continuing {
            addLine("Retomando la conversación…", running: true)
        } else if chat.turns.isEmpty {
            if !refs.isEmpty {
                addLine("Encontró \(placesCount(refs.count)) en \(Self.list(chat.projects))", places: true)
            } else if model.hasCode {
                addLine("No encontró nada cercano en tus proyectos; la respuesta sale de lo que sabe el modelo.")
            }
            if let indexing = model.status.code.indexing, indexing.total > 0 {
                let percent = Int((Double(indexing.done) / Double(indexing.total) * 100).rounded(.down))
                addLine("Todavía leyendo tu código (\(percent) %): parte aún no está.")
            }
            addLine("Preparando a Pi…", running: true)
        } else {
            addLine("Pensando la respuesta…", running: true)
        }
        announce(trail.last?["text"] as? String ?? "")
        pushTrail()
    }

    /// Sends it once the model is known and allowed: a model off this Mac needs a yes first (once per provider).
    private func begin(_ prompt: String, fresh: Bool) {
        guard let agentModel else {
            pending = prompt
            return
        }
        if !agentModel.local, !Self.approvedProviders.contains(agentModel.provider), fresh,
           !UserDefaults.standard.bool(forKey: "debugApproveProviders") {
            pending = prompt
            confirming = agentModel.provider
            return
        }
        send(prompt, fresh: fresh)
    }

    private func send(_ prompt: String, fresh: Bool) {
        sessionChat = chat?.id
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

    private static func line(_ line: ChatTurn.TrailLine) -> [String: Any] {
        line.places == true ? ["text": line.text, "places": true] : ["text": line.text]
    }

    /// At most this many lines of each place go to the model and the page.
    static let refLines = 40

    /// The question with its places, in the format the system prompt shows.
    private static func prompt(_ question: String, refs: [[String: Any]]) -> String {
        var text = "Question: \(question)\n\n"
        if refs.isEmpty {
            text += "Gafitas found no places in the user's projects for this. Answer from what you know: every piece is an Idea.\n"
        } else {
            text += "Places Gafitas dug up in the user's projects (cite them by id):\n"
            for ref in refs {
                text += "\n\(ref["id"]!) · \(ref["repo"]!)/\(ref["path"]!), lines \(ref["first"]!)-\(ref["last"]!)"
                    + ((ref["summary"] as? String).map { " · \($0)" } ?? "") + "\n\(ref["text"]!)\n"
            }
        }
        return text
    }

    /// A reopened chat goes on in a new session: Pi gets the questions so far and what it answered.
    private static func continuation(_ chat: Chat, question: String) -> String {
        let earlier = chat.turns.map { "Question: \($0.question)\nYour answer:\n\($0.program)" }.joined(separator: "\n\n")
        return "This continues a conversation with the user. Their earlier questions and the programs you answered with:\n\n"
            + earlier + "\n\nNow the next question.\n\n" + prompt(question, refs: chat.refs)
    }

    // MARK: The trail

    private func addLine(_ text: String, running: Bool = false, places: Bool = false) {
        var line: [String: Any] = ["text": text]
        if running { line["running"] = true }
        if places { line["places"] = true }
        trail.append(line)
    }

    private static let settled = ["Preparando a Pi…": "Pi empezó", "Retomando la conversación…": "Retomó la conversación",
                                  "Pensando la respuesta…": "Pensó la respuesta"]

    /// Every live line is done now (the next step started, or the answer is in).
    private func settleLines() {
        for index in trail.indices where trail[index]["running"] as? Bool == true {
            trail[index]["running"] = nil
            if let text = trail[index]["text"] as? String, let done = Self.settled[text] { trail[index]["text"] = done }
        }
    }

    private func pushTrail() {
        bridge.trail(turnID, lines: trail, summary: trailSummary,
                     thinking: [narration, thinking].filter { !$0.isEmpty }.joined(separator: "\n\n"))
    }

    /// What a tool call says on the trail, while it runs and once it's done.
    private func toolLine(_ name: String, args: [String: Any], result: [String: Any]?, failed: Bool) -> String {
        let file = ((args["path"] as? String ?? "") as NSString).lastPathComponent
        let pattern = args["pattern"] as? String ?? args["query"] as? String ?? ""
        guard let result else {
            switch name {
            case "dig": return "Buscando «\(pattern)» en tus proyectos…"
            case "read": return "Leyendo \(file.isEmpty ? "un archivo" : file)…"
            case "grep": return "Buscando «\(pattern)» en el código…"
            case "find": return "Buscando archivos «\(pattern)»…"
            case "ls": return "Mirando \(args["path"] as? String ?? "la carpeta")…"
            default: return "Mirando el código…"
            }
        }
        if failed { return name == "read" ? "No pudo leer \(file)" : "Una búsqueda no salió" }
        switch name {
        case "dig":
            let found = ((result["details"] as? [String: Any])?["refs"] as? [[String: Any]]) ?? []
            let repos = Array(Set(found.compactMap { $0["repo"] as? String })).sorted()
            return found.isEmpty ? "No encontró más lugares para «\(pattern)»"
                : "Encontró \(placesCount(found.count)) más en \(Self.list(repos))"
        case "read":
            if let offset = args["offset"] as? Int, let limit = args["limit"] as? Int {
                return "Leyó \(file), líneas \(offset)–\(offset + limit - 1)"
            }
            return "Leyó \(file)"
        case "grep": return "Buscó «\(pattern)» en el código"
        case "find": return "Buscó archivos «\(pattern)»"
        case "ls": return "Miró \(args["path"] as? String ?? "la carpeta")"
        default: return "Miró el código"
        }
    }

    /// The last whole sentence of what the model is thinking, at most once a second: "Pensando: «…»".
    private func showThought(_ text: String) {
        guard !drawing, Date().timeIntervalSince(thoughtShownAt) >= 1 else { return }
        let ends: Set<Character> = [".", "!", "?", "\n"]
        let sentences = text.split(whereSeparator: { ends.contains($0) })
        let closed = text.last.map(ends.contains) == true
        guard var sentence = (closed ? sentences.last : sentences.dropLast().last)?
            .trimmingCharacters(in: .whitespacesAndNewlines), sentence.count > 8 else { return }
        if sentence.count > 140 { sentence = "…" + sentence.suffix(139) }
        thoughtShownAt = Date()
        let line = "Pensando: «\(sentence)»"
        if let last = trail.last?["text"] as? String, last.hasPrefix("Pensando: ") {
            trail[trail.count - 1]["text"] = line
        } else {
            settleLines()
            addLine(line, running: true)
        }
        pushTrail()
    }

    /// VoiceOver hears the phases, at most every 700 ms.
    private func announce(_ text: String, always: Bool = false) {
        guard !text.isEmpty, always || Date().timeIntervalSince(announcedAt) >= 0.7 else { return }
        announcedAt = Date()
        NSAccessibility.post(element: NSApp as Any, notification: .announcementRequested,
                             userInfo: [.announcement: text, .priority: NSAccessibilityPriorityLevel.medium.rawValue])
    }

    // MARK: Pi and the page

    private func received(_ event: AgentRunner.Event) {
        switch event {
        case .model(let name, let provider, let local):
            agentModel = AgentModel(name: name, provider: provider, local: local)
            if let pending, confirming == nil {
                self.pending = nil
                begin(pending, fresh: true)
            }
        case .tool(let name, let args, let result, let failed):
            guard working, !drawing else { return }
            let text = toolLine(name, args: args, result: result, failed: failed)
            if result == nil {
                settleLines()
                addLine(text, running: true)
                announce(text)
            } else if let index = trail.lastIndex(where: { $0["running"] as? Bool == true }) {
                trail[index] = ["text": text]
                if name == "read" { filesRead += 1 }
            } else {
                addLine(text)
            }
            pushTrail()
        case .thinking(let delta):
            thinking += delta
            showThought(thinking)
        case .narration(let text):
            narration = text
            showThought(text)
        case .program(let text):
            if repairing {
                repair += text
            } else {
                if !drawing {
                    drawing = true
                    settleLines()
                    let read = filesRead == 1 ? "leyó 1 archivo" : "leyó \(filesRead) archivos"
                    trailSummary = (["Dibujando la respuesta…"] + (refs.isEmpty ? [] : [placesCount(refs.count)])
                        + (filesRead > 0 ? [read] : [])).joined(separator: " · ")
                    pushTrail()
                    announce("Dibujando la respuesta")
                }
                bridge.append(text)
                streamed += text
            }
        case .refs(let found):
            let roots = model.settings.codeRoots.map(\.path), skipped = model.settings.codeExcluded.map(\.path)
            var added: [[String: Any]] = []
            for var ref in found {
                // The extension checked them; the app checks again before the page may open one.
                guard let id = ref["id"] as? String, let file = ref["file"] as? String,
                      FolderSelection.isSearched(file, folders: roots, skipped: skipped) else { continue }
                // An id the chat already has keeps its place: earlier turns cite it.
                guard refs[id] == nil else {
                    log("ask: Pi's \(id) is taken; kept the chat's")
                    continue
                }
                ref["tint"] = projects.filter { file.hasPrefix($0.path + "/") }.map(\.index).first ?? 3
                refs[id] = ref
                added.append(ref)
            }
            if !added.isEmpty {
                bridge.refs(added.map(Self.forPage))
                chat?.refs += added
                for repo in added.compactMap({ $0["repo"] as? String }) where chat?.projects.contains(repo) == false {
                    chat?.projects.append(repo)
                }
            }
        case .finished(let aborted):
            if UserDefaults.standard.bool(forKey: "debugAskAnswer") {
                log("ask: \(repairing ? "repair" : "program"):\n\(repairing ? repair : streamed)")
            }
            if repairing {
                repairing = false
                bridge.replace(repair)
            } else if working {
                if aborted { stopped = true }
                if drawing { bridge.done() } else { finishTurn(stopped ? .stopped : .failed("Pi no dibujó nada")) }
            }
        case .failed(let problem):
            guard working else { return }
            if drawing { bridge.done() }
            finishTurn(.failed(problem))
            log("ask: answer failed: \(problem)")
        }
    }

    /// The page: a piece opened or adapted, or what it couldn't draw.
    private func page(_ message: [String: Any]) {
        switch message["type"] as? String {
        case "open":
            guard let id = message["ref"] as? String, let ref = refs[id], let file = ref["file"] as? String else { return }
            CodeEditor.current.open(URL(fileURLWithPath: file), line: message["line"] as? Int ?? ref["focus"] as? Int ?? 1)
        case "adapt":
            let path = message["path"] as? String ?? ""
            let from = (message["ref"] as? String).flatMap { refs[$0] }.map { "\($0["repo"] ?? "")/\($0["path"] ?? "")" }
            followUp = "¿Cómo escribo \(path)\(from.map { " a partir de \($0)" } ?? "")?"
            focusField()
        case "errors":
            guard working, message["turn"] as? String == turnID else { return }
            let errors = message["errors"] as? [[String: Any]] ?? []
            for error in errors { log("ask: undrawn \(error["id"] as? String ?? "?"): \(error["message"] as? String ?? "")") }
            if !errors.isEmpty, !repaired, !stopped, message["final"] as? Bool != true, agent.isRunning {
                repaired = true
                repairing = true
                repair = ""
                trailSummary = errors.count == 1 ? "Corrigiendo un error del dibujo…" : "Corrigiendo \(errors.count) errores del dibujo…"
                pushTrail()
                announce("Corrigiendo el dibujo")
                let lines = errors.map { "\($0["id"] as? String ?? "?"): \($0["message"] as? String ?? "")" }
                agent.correct("Reply with only the corrected statements, same ids:\n" + lines.joined(separator: "\n"))
                return
            }
            finishTurn(stopped ? .stopped : .done, program: message["program"] as? String)
            log("ask: answered in \(Int(Date().timeIntervalSince(started))) s, \(errors.count) left undrawn")
        default:
            break
        }
    }

    private enum Outcome {
        case done, stopped
        case failed(String)
    }

    /// The turn is over: its folded trail line, and the chat saved.
    private func finishTurn(_ outcome: Outcome, program: String? = nil) {
        let seconds = Int(Date().timeIntervalSince(started).rounded())
        let name = agentModel?.name ?? "el modelo"
        let drawn = program ?? streamed
        settleLines()
        let saved: String
        switch outcome {
        case .done:
            answer = .done
            // The places the answer cites, whether the app or Pi's own digs found them.
            let cited = Set(drawn.matches(of: /"([rd]\d+)(?::[\d\s\-–]+)?"/).map { String($0.output.1) })
                .intersection(refs.keys).count
            trailSummary = "Respondió \(name) en \(seconds) s" + (cited == 0 ? "" : " · cita \(placesCount(cited))")
            announce("Respuesta lista, en \(seconds) segundos", always: true)
            saved = "done"
        case .stopped:
            answer = .done
            trailSummary = "Detuviste la respuesta a los \(seconds) s." + (drawing ? " Lo que alcanzó a dibujar se queda." : "")
            saved = "stopped"
        case .failed(let problem):
            answer = .failed(problem)
            trailSummary = "La respuesta se cortó: \(problem)." + (drawing ? " Lo que alcanzó a dibujar se queda." : "")
            saved = "failed: \(problem)"
        }
        pushTrail()
        guard var chat else { return }
        chat.turns.append(ChatTurn(question: turnQuestion, asked: started, model: name, local: agentModel?.local ?? false,
                                   seconds: seconds, program: drawn,
                                   trail: trail.map { ChatTurn.TrailLine(text: $0["text"] as? String ?? "",
                                                                         places: $0["places"] as? Bool) },
                                   summary: trailSummary ?? "",
                                   thinking: [narration, thinking].filter { !$0.isEmpty }.joined(separator: "\n\n"),
                                   outcome: saved))
        self.chat = chat
        chatLog.save(chat)
        refreshHistory()
    }

    // MARK: Digging

    private func dig(now: Bool = false) {
        generation += 1
        let current = generation
        task?.cancel()
        dug = false
        let text = trimmed
        guard !text.isEmpty else {
            places = []
            return
        }
        guard engine.hasCode else { return }
        engine.prewarm()
        engine.embedAhead(text, code: true)
        let skipped = leftOut
        let showAt = ContinuousClock.now + (now ? .zero : SearchField.typingPause)
        task = Task {
            let vector = await engine.embedQuery(text, code: true)
            guard !Task.isCancelled, current == generation else { return }
            let hits = await engine.search(text, vector: vector, prefixLast: false, limit: 40, code: true,
                                           zGate: Self.zGate)
            try? await Task.sleep(until: showAt, tolerance: .milliseconds(1), clock: .continuous)
            guard !Task.isCancelled, current == generation else { return }
            let terms = Searcher.terms(text)
            // Code first, then the repos' docs, each kind in rank order: a question about what's built is answered
            // by code ("urllib3.request()" in a docs stub came before HTTPAdapter.send otherwise).
            let rows = hits.map { ResultRow($0, terms: terms) }.filter { row in
                !skipped.contains { row.url.path.hasPrefix($0 + "/") }
            }.enumerated().sorted { a, b in
                let (aDoc, bDoc) = (Self.isDoc(a.element), Self.isDoc(b.element))
                return aDoc == bDoc ? a.offset < b.offset : !aDoc
            }.map(\.element)
            places = Array(rows.prefix(Self.placeLimit))
            // The refs name each place by what it's in, so the summaries are read before the answer starts.
            for row in places where summaries[row.id] == nil {
                guard let text = await engine.text(ofSegment: row.segmentID, code: true), current == generation
                else { continue }
                summaries[row.id] = await Self.summary(text, of: row)
            }
            guard current == generation else { return }
            dug = true
            if answerWhenDug {
                answerWhenDug = false
                startAnswer()
            }
            log("ask: \"\(text)\": \(places.count) places in \(Set(places.map(repoName)).count) repos")
        }
    }

    /// A repo's notes (README, docs) rather than its code.
    private static func isDoc(_ row: ResultRow) -> Bool {
        Rules.codeTextExtensions.contains(row.url.pathExtension.lowercased())
    }

    /// A place in a line: what it defines, or, when it starts in the middle of something, what it's in ("en
    /// HTTPAdapter.send", "en def send(…" when there's no class), from the file around it.
    private static func summary(_ text: String, of row: ResultRow) async -> String {
        let own = CodeExtractor.summary(text)
        guard !CodeExtractor.defines(own), row.segment == .lines, let first = row.loc else { return own }
        return await Task.detached {
            guard let file = try? String(contentsOf: row.url, encoding: .utf8),
                  let outer = CodeExtractor.enclosing(file, line: Int(first)) else { return own }
            if let name = CodeExtractor.name(definedBy: outer.text),
               let owner = CodeExtractor.enclosing(file, line: outer.line, within: 5000)
                   .flatMap({ CodeExtractor.name(definedBy: $0.text) }) {
                return "en \(owner).\(name)"
            }
            return "en " + outer.text
        }.value
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
