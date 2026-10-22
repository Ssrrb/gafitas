import AppKit
import DigUpKit
import Observation
import SwiftUI

enum SettingsTab: String, CaseIterable {
    case general, code, storage

    var title: String {
        switch self {
        case .general: "General"
        case .code: "Código"
        case .storage: "Almacenamiento"
        }
    }

    var symbol: String {
        switch self {
        case .general: "gearshape"
        case .code: "chevron.left.forwardslash.chevron.right"
        case .storage: "internaldrive"
        }
    }
}

/// Settings, the way Mac apps lay them out: a toolbar of tabs, and the window sized to each one. Code is also where
/// the index shows how far along it is, folder by folder.
final class SettingsWindowController: NSObject, NSWindowDelegate {
    let state: SettingsState
    /// Código → Añadir carpetas… (code search's folders), a sheet on this window.
    let codeSheet: AddFoldersController
    private unowned let app: AppController
    private var window: NSWindow?
    private var tabs: NSTabViewController?

    init(app: AppController) {
        self.app = app
        state = SettingsState(app: app)
        codeSheet = AddFoldersController(app: app)
        super.init()
        state.addCodeFolders = { [weak self] in self?.addCodeFolders() }
        codeSheet.onAdded = { [weak self] in
            guard let self else { return }
            Task { await self.state.refresh() }
        }
    }

    /// Opens the code folders' sheet on the Code tab.
    func addCodeFolders() {
        codeSheet.begin(on: window)
    }

    var isVisible: Bool { window?.isVisible == true }

    func show(_ tab: SettingsTab = .general) {
        let window = self.window ?? makeWindow()
        tabs?.selectedTabViewItemIndex = SettingsTab.allCases.firstIndex(of: tab) ?? 0
        state.tab = tab
        Task { await state.refresh() }
        app.present(window)
    }

    var selectedTab: SettingsTab { state.tab }

    private func makeWindow() -> NSWindow {
        let tabs = NSTabViewController()
        tabs.tabStyle = .toolbar
        tabs.transitionOptions = [.allowUserInteraction]
        for tab in SettingsTab.allCases {
            let controller = NSHostingController(rootView: SettingsPane(tab: tab, state: state))
            controller.sizingOptions = .preferredContentSize
            controller.title = tab.title   // the window takes the selected tab's title
            let item = NSTabViewItem(viewController: controller)
            item.label = tab.title
            item.image = NSImage(systemSymbolName: tab.symbol, accessibilityDescription: tab.title)
            item.identifier = tab.rawValue
            tabs.addTabViewItem(item)
        }
        let window = NSWindow(contentViewController: tabs)
        window.styleMask = [.titled, .closable]
        window.toolbarStyle = .preference
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.center()
        self.tabs = tabs
        self.window = window
        state.selectTab = { [weak self] tab in
            self?.tabs?.selectedTabViewItemIndex = SettingsTab.allCases.firstIndex(of: tab) ?? 0
        }
        return window
    }

    func windowWillClose(_ notification: Notification) {
        codeSheet.end()
        window?.contentViewController = nil
        window = nil
        tabs = nil
        app.windowClosed()
    }

    func snapshot(to url: URL) throws {
        // On macOS 26 the selected tab sits on glass, which `cacheDisplay` draws as a blank white square (the window on
        // screen is fine): the picture leaves the glass out, so the tab shows as the window server would draw it, minus
        // its highlight.
        var hidden: [NSView] = []
        if #available(macOS 26, *), let frame = window?.contentView?.superview {
            func glass(in view: NSView) -> [NSView] {
                (view is NSGlassEffectView ? view.subviews : []) + view.subviews.flatMap { glass(in: $0) }
            }
            hidden = glass(in: frame).filter { !$0.isHidden }
            hidden.forEach { $0.isHidden = true }
        }
        defer { hidden.forEach { $0.isHidden = false } }
        try Snapshot.write(window, to: url)
    }
}

@Observable
final class SettingsState {
    var tab = SettingsTab.general
    private(set) var codeSummaries: [Engine.RootSummary] = []
    private(set) var indexSize: Int64 = 0
    private(set) var codeIndexSize: Int64 = 0
    private(set) var history = (chats: 0, bytes: Int64(0))
    var launchAtLogin = false
    var loginProblem: String?
    @ObservationIgnored let app: AppController
    @ObservationIgnored var selectTab: (SettingsTab) -> Void = { _ in }
    @ObservationIgnored var addCodeFolders: () -> Void = {}

    init(app: AppController) {
        self.app = app
    }

    @ObservationIgnored private var lastRefresh = Date.distantPast
    @ObservationIgnored private var refreshPending = false

    var model: AppModel { app.model }

    func refresh() async {
        lastRefresh = Date()
        launchAtLogin = app.launchesAtLogin
        indexSize = app.engine.indexSize
        codeIndexSize = app.engine.codeIndexSize
        history = app.chatLog.usage()
        codeSummaries = await app.engine.rootSummaries(code: true)
        isLoaded = true
    }

    /// The index changed: refresh the folder counts, at most every 2 s while files are being indexed.
    func statusChanged() {
        guard !refreshPending else { return }
        refreshPending = true
        let wait = max(0, 2 - Date().timeIntervalSince(lastRefresh))
        Task {
            try? await Task.sleep(for: .seconds(wait))
            refreshPending = false
            await refresh()
        }
    }

    /// Ready to be drawn (debug snapshots wait for this).
    private(set) var isLoaded = false

    static func historyAlert() -> NSAlert {
        let alert = NSAlert()
        alert.messageText = "¿Borrar todo el historial?"
        alert.informativeText = "Se borran de este Mac todas tus conversaciones. No se puede deshacer."
        alert.addButton(withTitle: "Borrar").hasDestructiveAction = true
        alert.addButton(withTitle: "Cancelar").keyEquivalent = "\u{1b}"
        return alert
    }

    /// Almacenamiento → Borrar el historial…: asks first, then deletes every saved chat.
    func deleteHistory() {
        let alert = Self.historyAlert()
        let done = { [self] (response: NSApplication.ModalResponse) in
            guard response == .alertFirstButtonReturn else { return }
            app.chatLog.deleteAll()
            log("history: deleted (\(history.chats) chats)")
            app.askWindow.ask.refreshHistory()
            history = app.chatLog.usage()
        }
        if let window = NSApp.keyWindow { alert.beginSheetModal(for: window, completionHandler: done) } else { done(alert.runModal()) }
    }
}

/// One tab's content, at the width every tab shares.
private struct SettingsPane: View {
    let tab: SettingsTab
    let state: SettingsState
    /// The content's own height. The window is that tall up to what the screen has room for, and scrolls past it (a
    /// long list of folders ran it off the screen, Añadir carpetas… with it).
    @State private var height: CGFloat?

    var body: some View {
        ScrollView(.vertical) {
            Group {
                switch tab {
                case .general: GeneralSettings(state: state)
                case .code: CodeSettings(state: state)
                case .storage: StorageSettings(state: state)
                }
            }
            .frame(width: 580)
            .fixedSize(horizontal: false, vertical: true)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
        }
        .scrollBounceBehavior(.basedOnSize)
        .frame(width: 580, height: height.map { min($0, Self.tallest) })
    }

    /// The screen's room below the menu bar, less the window's title bar and tabs and a margin.
    private static var tallest: CGFloat {
        (NSScreen.main?.visibleFrame.height ?? 800) - 140
    }
}

private struct GeneralSettings: View {
    @Bindable var state: SettingsState

    var body: some View {
        Form {
            Section {
                LabeledContent {
                    ShortcutRecorder(combo: state.model.hotkey, apply: { state.app.setHotkey($0) },
                                     listening: { state.app.hotkeyRecording($0) }, capSize: 13)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Atajo para preguntar")
                        Text("Abre la ventana de preguntas desde cualquier app.")
                            .font(.system(size: 11))
                            .foregroundStyle(Brand.muted)
                    }
                }
            }
            Section {
                Toggle(isOn: Binding(get: { state.launchAtLogin }, set: { on in
                    state.loginProblem = state.app.setLaunchAtLogin(on)
                    state.launchAtLogin = state.app.launchesAtLogin
                })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Abrir Gafitas al iniciar sesión")
                        Text(state.loginProblem ?? "Así el atajo siempre funciona.")
                            .font(.system(size: 11))
                            .foregroundStyle(state.loginProblem == nil ? Brand.muted : Brand.negative)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .scrollDisabled(true)
    }
}

private struct FolderStatusRow: View {
    let summary: Engine.RootSummary
    let remove: () -> Void
    @State private var showingReasons = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(nsImage: NSWorkspace.shared.icon(forFile: summary.missing ? "/Volumes" : summary.path))
                .resizable()
                .frame(width: 32, height: 32)
                .opacity(summary.missing ? 0.5 : 1)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text((summary.path as NSString).lastPathComponent).font(.system(size: 13, weight: .semibold))
                    if summary.missing || summary.unreadable {
                        Text(summary.missing ? "Sin conectar" : "Sin acceso")
                            .font(.system(size: 10, weight: .semibold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 1)
                            .background(Capsule().fill(Color.orange.opacity(0.2)))
                    }
                    if summary.unreadable {
                        Button("Permitir en Ajustes del Sistema…", action: openFolderPrivacySettings)
                            .buttonStyle(.link)
                            .font(.system(size: 11))
                    }
                }
                Text(tildePath(summary.path))
                    .font(.system(size: 11))
                    .foregroundStyle(Brand.muted)
                    .lineLimit(1)
                    .truncationMode(.middle)
                if !summary.kinds.isEmpty {
                    KindCounts(counts: summary.kinds).padding(.top, 1)
                }
            }
            Spacer(minLength: 8)
            if reasons.isEmpty {
                counts
            } else {
                Button { showingReasons.toggle() } label: {
                    HStack(spacing: 3) {
                        counts
                        Image(systemName: "info.circle").font(.system(size: 11)).foregroundStyle(Brand.muted)
                    }
                }
                .buttonStyle(.plain)
                .help("Por qué algunos archivos no se leen")
                .popover(isPresented: $showingReasons, arrowEdge: .bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(reasons, id: \.self) { Text($0) }
                    }
                    .font(.system(size: 12))
                    .padding(12)
                    .frame(maxWidth: 360, alignment: .leading)
                }
            }
            Button(action: remove) {
                Image(systemName: "minus.circle.fill").foregroundStyle(Brand.muted)
            }
            .buttonStyle(.plain)
            .help("Dejar de leer este proyecto")
            .accessibilityLabel("Quitar \((summary.path as NSString).lastPathComponent)")
        }
        .padding(.vertical, 2)
    }

    /// "11 de 12 leídos · 1 omitido", on one line.
    private var counts: some View {
        HStack(spacing: 4) {
            Text(summary.missing || summary.unreadable ? "Se guarda para cuando vuelva"
                 : "\(number(summary.indexed)) de \(number(summary.files)) leídos")
                .font(.system(size: 12, weight: .medium).monospacedDigit())
            if !states.isEmpty {
                Text("· " + states).font(.system(size: 12).monospacedDigit()).foregroundStyle(Brand.muted)
            }
        }
        .lineLimit(1)
        .fixedSize()
    }

    private func number(_ count: Int) -> String { count.formatted(.number.locale(When.locale)) }

    private var states: String {
        [summary.pending > 0 ? "\(number(summary.pending)) por leer" : nil,
         summary.unfinished > 0
            ? "\(number(summary.unfinished)) \(summary.unfinished == 1 ? "largo" : "largos") por terminar" : nil,
         summary.skipped > 0 ? "\(number(summary.skipped)) \(summary.skipped == 1 ? "omitido" : "omitidos")" : nil,
         summary.failed > 0
            ? "\(number(summary.failed)) \(summary.failed == 1 ? "no se pudo leer" : "no se pudieron leer")" : nil,
         summary.leftOutCount > 0 ? "\(number(summary.leftOutCount)) sin leer" : nil].compactMap { $0 }
            .joined(separator: " · ")
    }

    /// One line per reason: what the crawl never queued from this folder, then what was skipped once read. The
    /// reasons come from the index in English (DigUpKit's words): these say them in Spanish.
    private var reasons: [String] {
        let crawl: [String: String] = [
            "other type": "de tipos que Gafitas no lee",
            "app or bundle": "dentro de apps o paquetes",
            "link or special file": "enlaces o archivos especiales",
            "in the cloud, not downloaded": "solo en la nube, sin descargar",
            "ignored by git": "que git ignora",
            "too big to be written by hand": "demasiado grandes para estar escritos a mano",
            "data file": "archivos de datos",
            "minified": "minificados",
            "license": "licencias",
            "key or password file": "archivos de claves o contraseñas",
            "excluded type": "de los tipos que omites",
        ]
        let folders: [String: String] = [
            "vendored or built code": "con código de terceros o generado",
            "submodule or worktree": "submódulos o worktrees",
            "excluded folder": "que omites",
        ]
        let skipped: [String: String] = ["no code": "sin código", "no text": "sin texto", "not read": "sin leer"]
        let leftOut = summary.leftOut.sorted { $0.value > $1.value }.map { reason, count in
            reason.hasPrefix("folders ")
                ? "\(number(count)) \(count == 1 ? "carpeta" : "carpetas") \(folders[String(reason.dropFirst(8))] ?? String(reason.dropFirst(8))) sin abrir"
                : "\(number(count)) \(crawl[reason] ?? reason)"
        }
        return leftOut + summary.skippedReasons.sorted { $0.value > $1.value }.map {
            "\(number($1)) \($1 == 1 ? "omitido" : "omitidos"): \(skipped[$0] ?? $0)"
        }
    }
}

private struct StorageSettings: View {
    let state: SettingsState

    var body: some View {
        Form {
            Section {
                LabeledContent("EmbeddingGemma 2") {
                    Text("Google · Apache 2.0 · 865 MB")
                }
                LabeledContent("Estado") {
                    HStack(spacing: 8) {
                        Text(state.model.download.isReady ? "Descargado" : state.model.download.progressText)
                        switch state.model.download.phase {
                        case .needed, .failed:
                            Button("Descargar") { state.model.download.start() }.controlSize(.small)
                            Button("Usar archivos…") { state.model.download.chooseFiles(for: NSApp.keyWindow) }
                                .controlSize(.small)
                        default:
                            EmptyView()
                        }
                    }
                }
                LabeledContent("Ubicación") {
                    PathButton(url: state.model.settings.modelsDirectory)
                }
            } header: {
                Text("Modelo de búsqueda")
            } footer: {
                if !state.model.download.isReady {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Si tu red bloquea Hugging Face, descarga los dos archivos en otra red y pulsa Usar "
                             + "archivos… para elegirlos. Gafitas los comprueba antes de usarlos.")
                            .font(.system(size: 11))
                            .foregroundStyle(Brand.muted)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer()
                        Button("Copiar enlaces") {
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(ModelDownload.links, forType: .string)
                        }
                        .controlSize(.small)
                        .help("Copia las direcciones de los dos archivos")
                    }
                }
            }
            Section("Índice") {
                LabeledContent("Tamaño en disco", value: bytes(state.indexSize + state.codeIndexSize))
                LabeledContent("Ubicación") {
                    PathButton(url: state.model.settings.indexDirectory)
                }
            }
            Section("Historial") {
                LabeledContent {
                    Button("Borrar el historial…", action: state.deleteHistory)
                        .disabled(state.history.chats == 0)
                } label: {
                    Text(state.history.chats == 0 ? "Todavía no hay conversaciones"
                         : "\(state.history.chats.formatted(.number.locale(When.locale))) "
                           + "\(state.history.chats == 1 ? "conversación" : "conversaciones") · \(bytes(state.history.bytes))")
                }
            }
            Section("Privacidad") {
                Text("Gafitas lee los proyectos que eliges y guarda su índice en este Mac, y descarga una vez su modelo "
                     + "de búsqueda. Para responder, tu pregunta, los lugares que encontró y lo que Pi lea de tus "
                     + "proyectos van al modelo con el que responde Pi (Código → Respuestas). El historial de "
                     + "preguntas también se queda en este Mac.")
                    .foregroundStyle(Brand.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Section {
                Text("Gafitas \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") · "
                     + "EmbeddingGemma 2 de Google (Apache 2.0), con llama.cpp (MIT).")
                    .font(.system(size: 11))
                    .foregroundStyle(Brand.muted)
            }
        }
        .formStyle(.grouped)
        .scrollDisabled(true)
    }
}

/// Code search: its projects and how far along their index is, when it reads, the editor places open in, and who
/// writes the answers.
private struct CodeSettings: View {
    @Bindable var state: SettingsState
    @State private var removing: Engine.RootSummary?

    var body: some View {
        Form {
            if state.model.hasCode {
                Section {
                    HStack {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(state.model.codeStatusLine + " · " + bytes(state.codeIndexSize))
                                .font(.system(size: 12, weight: .medium))
                            if let indexing = state.model.status.code.indexing, indexing.total > 0 {
                                ProgressView(value: Double(indexing.done) / Double(indexing.total)).controlSize(.small)
                            }
                        }
                        Spacer()
                        Button(state.model.status.paused ? "Reanudar la lectura" : "Pausar la lectura") {
                            state.app.engine.setPaused(!state.model.status.paused)
                        }
                    }
                }
            }
            Section {
                if state.codeSummaries.isEmpty {
                    Text("Todavía no hay proyectos. Añade las carpetas donde guardas tu código.")
                        .foregroundStyle(Brand.muted)
                }
                ForEach(state.codeSummaries) { summary in
                    FolderStatusRow(summary: summary) { removing = summary }
                }
            } header: {
                Text("Proyectos")
            } footer: {
                HStack {
                    Button(action: state.addCodeFolders) {
                        Label("Añadir carpetas…", systemImage: "plus")
                    }
                    Spacer()
                }
            }
            if state.model.hasCode {
                Section {
                    ForEach(state.model.settings.codeExcluded, id: \.path) { folder in
                        HStack {
                            Image(nsImage: NSWorkspace.shared.icon(forFile: folder.path))
                                .resizable()
                                .frame(width: 18, height: 18)
                            Text(tildePath(folder.path)).lineLimit(1).truncationMode(.middle)
                            Spacer()
                            Button {
                                state.app.applyCodeFolders(state.model.settings.codeRoots,
                                                           excluded: state.model.settings.codeExcluded.filter { $0 != folder })
                            } label: {
                                Image(systemName: "minus.circle.fill").foregroundStyle(Brand.muted)
                            }
                            .buttonStyle(.plain)
                            .help("Volver a leer el código de esta carpeta")
                        }
                    }
                    if state.model.settings.codeExcluded.isEmpty {
                        Text("Ninguna. Lo que git ignora, el código de terceros y el generado se omiten siempre.")
                            .foregroundStyle(Brand.muted)
                    }
                } header: {
                    Text("Omitir estas carpetas")
                } footer: {
                    HStack {
                        Button {
                            state.app.pickFolders(for: NSApp.keyWindow, prompt: "Omitir") { folders in
                                guard !folders.isEmpty else { return }
                                let excluded = state.model.settings.codeExcluded
                                state.app.applyCodeFolders(state.model.settings.codeRoots,
                                                           excluded: excluded + folders.filter { !excluded.contains($0) })
                            }
                        } label: {
                            Label("Omitir una carpeta…", systemImage: "plus")
                        }
                        Spacer()
                    }
                }
            }
            Section {
                Toggle(isOn: Binding(get: { state.model.settings.indexOnBattery },
                                     set: { state.app.setIndexOnBattery($0) })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Leer con batería")
                        Text(AppSettings.batteryDetail)
                            .font(.system(size: 11))
                            .foregroundStyle(Brand.muted)
                    }
                }
                Toggle(isOn: Binding(get: { state.model.settings.indexHoursOn }, set: { on in
                    state.app.setIndexHours(on: on, hours: state.model.settings.indexHours)
                })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Leer solo a ciertas horas")
                        Text("Preguntar funciona todo el día.")
                            .font(.system(size: 11))
                            .foregroundStyle(Brand.muted)
                    }
                }
                if state.model.settings.indexHoursOn {
                    HStack(spacing: 6) {
                        Text("De")
                        DatePicker("De", selection: time(\.start), displayedComponents: .hourAndMinute)
                            .labelsHidden()
                        Text("a")
                        DatePicker("A", selection: time(\.end), displayedComponents: .hourAndMinute)
                            .labelsHidden()
                        Spacer()
                    }
                    .environment(\.locale, When.locale)
                }
            } header: {
                Text("Cuándo leer")
            }
            Section {
                Picker("Abrir el código en", selection: Binding(get: { CodeEditor.chosen(state.model.settings.codeEditor).id },
                                                                set: { state.app.setCodeEditor($0) })) {
                    ForEach(CodeEditor.installed) { editor in Text(editor.name).tag(editor.id) }
                    Text(CodeEditor.defaultApp.name).tag(CodeEditor.defaultApp.id)
                }
            } footer: {
                Text("Una pieza se abre ahí, en su línea.")
                    .font(.system(size: 11))
                    .foregroundStyle(Brand.muted)
            }
            AnswerSettings(state: state)
        }
        .formStyle(.grouped)
        .scrollDisabled(true)
        .onChange(of: state.model.status) { state.statusChanged() }
        .confirmationDialog("¿Dejar de leer «\(removing.map { ($0.path as NSString).lastPathComponent } ?? "")»?",
                            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } })) {
            Button("Quitar", role: .destructive) {
                guard let removing else { return }
                state.app.removeCodeFolder(URL(fileURLWithPath: removing.path))
                Task { await state.refresh() }
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Sus \(removing?.files.formatted(.number.locale(When.locale)) ?? "") archivos de código salen del índice.")
        }
    }

    /// One end of the set hours, as a time of day for a date picker.
    private func time(_ end: KeyPath<IndexHours, Int>) -> Binding<Date> {
        Binding(get: {
            let minute = state.model.settings.indexHours[keyPath: end]
            return Calendar.current.date(bySettingHour: minute / 60, minute: minute % 60, second: 0, of: Date()) ?? Date()
        }, set: { date in
            let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
            let minute = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
            let hours = state.model.settings.indexHours
            state.app.setIndexHours(on: true, hours: end == \IndexHours.start ? IndexHours(start: minute, end: hours.end)
                                                                              : IndexHours(start: hours.start, end: minute))
        })
    }
}

/// Answers in the Ask window: who writes them (Pi, with its model), the providers you let questions go to, and what
/// goes there.
private struct AnswerSettings: View {
    let state: SettingsState
    @State private var pi = AgentRunner.locate()
    @State private var approved = UserDefaults.standard.stringArray(forKey: "approvedProviders") ?? []

    var body: some View {
        Section {
            LabeledContent("Pi") {
                if let pi {
                    Text("En \(tildePath(pi.path))").foregroundStyle(Brand.muted)
                } else {
                    HStack(spacing: 8) {
                        Text("No está instalado").foregroundStyle(Brand.muted)
                        Button("Copiar comando") {
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(NeedsPi.installCommand, forType: .string)
                        }
                        .help(NeedsPi.installCommand)
                    }
                }
            }
            LabeledContent("Modelo") {
                // Pi says which once it has started for a question; it's chosen in Pi (/model).
                if let agent = state.app.askWindow.ask.agentModel {
                    Text(agent.name + (agent.local ? " · en este Mac" : "")).foregroundStyle(Brand.muted)
                } else {
                    Text("El que tenga elegido Pi").foregroundStyle(Brand.muted)
                }
            }
            .help("Pi responde con este modelo. Se cambia en Pi, con /model.")
            LabeledContent("Proveedores aprobados") {
                if approved.isEmpty {
                    Text("Ninguno").foregroundStyle(Brand.muted)
                } else {
                    VStack(alignment: .trailing, spacing: 6) {
                        ForEach(approved, id: \.self) { provider in
                            HStack(spacing: 8) {
                                Text(provider).foregroundStyle(Brand.muted)
                                Button("Olvidar") { forget(provider) }
                                    .controlSize(.small)
                                    .help("Gafitas vuelve a preguntar antes de enviar nada a \(provider)")
                            }
                        }
                    }
                }
            }
        } header: {
            Text("Respuestas")
        } footer: {
            Text("Para escribir cada respuesta, Gafitas envía a través de Pi tu pregunta, los lugares que encontró y lo "
                 + "que Pi lea de esos proyectos mientras responde. Nada más sale de este Mac.")
                .font(.system(size: 11))
                .foregroundStyle(Brand.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func forget(_ provider: String) {
        approved.removeAll { $0 == provider }
        UserDefaults.standard.set(approved, forKey: "approvedProviders")
    }
}

/// "~/Library/…/Models" that shows the folder in Finder.
private struct PathButton: View {
    let url: URL

    var body: some View {
        Button {
            NSWorkspace.shared.activateFileViewerSelecting([url])
        } label: {
            HStack(spacing: 4) {
                Text(tildePath(url.path)).lineLimit(1).truncationMode(.middle)
                Image(systemName: "arrow.right.circle.fill").foregroundStyle(Brand.muted)
            }
        }
        .buttonStyle(.plain)
        .help("Mostrar en el Finder")
    }
}
