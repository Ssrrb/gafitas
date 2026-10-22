import AppKit
import DigUpKit
import Observation
import SwiftUI

enum SettingsTab: String, CaseIterable {
    case general, code, storage

    var title: String {
        switch self {
        case .general: "General"
        case .code: "Code"
        case .storage: "Storage"
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
    /// Code → Add Folders… (code search's folders), a sheet on this window.
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
        try Snapshot.write(window, to: url)
    }
}

@Observable
final class SettingsState {
    var tab = SettingsTab.general
    private(set) var codeSummaries: [Engine.RootSummary] = []
    private(set) var indexSize: Int64 = 0
    private(set) var codeIndexSize: Int64 = 0
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
}

/// One tab's content, at the width every tab shares.
private struct SettingsPane: View {
    let tab: SettingsTab
    let state: SettingsState
    /// The content's own height. The window is that tall up to what the screen has room for, and scrolls past it (a
    /// long list of folders ran it off the screen, Add Folders… with it).
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
                        Text("Ask shortcut")
                        Text("Opens the Ask window from any app.")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Section {
                Toggle(isOn: Binding(get: { state.launchAtLogin }, set: { on in
                    state.loginProblem = state.app.setLaunchAtLogin(on)
                    state.launchAtLogin = state.app.launchesAtLogin
                })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Open Gafitas when you log in")
                        Text(state.loginProblem ?? "So the shortcut always works.")
                            .font(.system(size: 11))
                            .foregroundStyle(state.loginProblem == nil ? AnyShapeStyle(.secondary) : AnyShapeStyle(.red))
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
                        Text(summary.missing ? "Not connected" : "No access")
                            .font(.system(size: 10, weight: .semibold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 1)
                            .background(Capsule().fill(Color.orange.opacity(0.2)))
                    }
                    if summary.unreadable {
                        Button("Allow in Settings…", action: openFolderPrivacySettings)
                            .buttonStyle(.link)
                            .font(.system(size: 11))
                    }
                }
                Text(tildePath(summary.path))
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                if !summary.kinds.isEmpty {
                    KindCounts(counts: summary.kinds).padding(.top, 1)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(summary.missing || summary.unreadable ? "Kept for when it's back"
                     : "\(summary.indexed.formatted()) of \(summary.files.formatted()) indexed")
                    .font(.system(size: 12, weight: .medium).monospacedDigit())
                if !states.isEmpty {
                    if reasons.isEmpty {
                        Text(states).font(.system(size: 11)).foregroundStyle(.secondary)
                    } else {
                        Button { showingReasons.toggle() } label: {
                            HStack(spacing: 3) {
                                Text(states)
                                Image(systemName: "info.circle")
                            }
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .help("Why some files aren't searchable")
                        .popover(isPresented: $showingReasons, arrowEdge: .bottom) {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(reasons, id: \.self) { Text($0) }
                            }
                            .font(.system(size: 12))
                            .padding(12)
                            .frame(maxWidth: 360, alignment: .leading)
                        }
                    }
                }
            }
            Button(action: remove) {
                Image(systemName: "minus.circle.fill").foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .help("Stop searching this folder")
            .accessibilityLabel("Remove \((summary.path as NSString).lastPathComponent)")
        }
        .padding(.vertical, 2)
    }

    private var states: String {
        [summary.pending > 0 ? "\(summary.pending.formatted()) waiting" : nil,
         summary.unfinished > 0
            ? "\(summary.unfinished.formatted()) long \(summary.unfinished == 1 ? "file" : "files") to finish" : nil,
         summary.skipped > 0 ? "\(summary.skipped.formatted()) skipped" : nil,
         summary.failed > 0 ? "\(summary.failed.formatted()) couldn't be read" : nil,
         summary.leftOutCount > 0 ? "\(summary.leftOutCount.formatted()) not read" : nil].compactMap { $0 }
            .joined(separator: " · ")
    }

    /// One line per reason: what the crawl never queued from this folder, then what was skipped once read.
    private var reasons: [String] {
        let crawl: [String: String] = [
            "other type": "of types Gafitas doesn't read",
            "app or bundle": "inside apps or bundles",
            "Photos library": "in a Photos library (its photos aren't read yet)",
            "link or special file": "links or special files",
            "in the cloud, not downloaded": "only in the cloud, not downloaded",
            "inside a code project": "inside code projects, where only screenshots count",
            "dataset": "in folders that look like datasets",
            "code or data file": "code or data files",
            "excluded type": "of the file types you skip",
        ]
        let leftOut = summary.leftOut.sorted { $0.value > $1.value }.map { reason, count in
            reason.hasPrefix("folders ") ? "\(count.formatted()) \(reason) weren't opened"
                : "\(count.formatted()) \(crawl[reason] ?? reason)"
        }
        let skipped = summary.skippedReasons.sorted { $0.value > $1.value }.map { "\($1.formatted()) skipped: \($0)" }
        return leftOut + skipped
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
                LabeledContent("Status") {
                    HStack(spacing: 8) {
                        Text(state.model.download.isReady ? "Downloaded" : state.model.download.progressText)
                        switch state.model.download.phase {
                        case .needed, .failed:
                            Button("Download") { state.model.download.start() }.controlSize(.small)
                            Button("Use Files…") { state.model.download.chooseFiles(for: NSApp.keyWindow) }
                                .controlSize(.small)
                        default:
                            EmptyView()
                        }
                    }
                }
                LabeledContent("Location") {
                    PathButton(url: state.model.settings.modelsDirectory)
                }
            } header: {
                Text("Model")
            } footer: {
                if !state.model.download.isReady {
                    HStack(alignment: .firstTextBaseline) {
                        Text("If your network blocks Hugging Face, download the two files on another network and "
                             + "click Use Files… to choose them. Gafitas checks them before it uses them.")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer()
                        Button("Copy Links") {
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(ModelDownload.links, forType: .string)
                        }
                        .controlSize(.small)
                        .help("Copies the addresses of the two files")
                    }
                }
            }
            Section("Index") {
                LabeledContent("Size on disk", value: bytes(state.indexSize))
                if state.model.hasCode {
                    LabeledContent("Code index", value: bytes(state.codeIndexSize))
                }
                LabeledContent("Location") {
                    PathButton(url: state.model.settings.indexDirectory)
                }
            }
            Section("Privacy") {
                Text("Gafitas reads the folders you choose and keeps what it learns in its index, on this Mac. "
                     + "It downloads its model once; questions in the Ask window go to the model Pi answers with "
                     + "(Code → Answers).")
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Section {
                Text("Gafitas \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") · "
                     + "EmbeddingGemma 2 by Google (Apache 2.0), run by llama.cpp (MIT).")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .scrollDisabled(true)
    }
}

/// Code search: its folders and how far along their index is, when it indexes, the editor places open in, and
/// turning it off.
private struct CodeSettings: View {
    @Bindable var state: SettingsState
    @State private var turningOff = false
    @State private var removing: Engine.RootSummary?

    var body: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Your code").font(.system(size: 13, weight: .semibold))
                    Text("Gafitas reads the code in these folders, on this Mac, so the Ask window can find the places "
                         + "that answer your question.")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if state.model.hasCode {
                    HStack {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(state.model.codeStatusLine).font(.system(size: 12, weight: .medium))
                            if let indexing = state.model.status.code.indexing, indexing.total > 0 {
                                ProgressView(value: Double(indexing.done) / Double(indexing.total)).controlSize(.small)
                            }
                        }
                        Spacer()
                        Text(bytes(state.codeIndexSize))
                            .font(.system(size: 11).monospacedDigit())
                            .foregroundStyle(.secondary)
                        Button(state.model.status.paused ? "Resume" : "Pause") {
                            state.app.engine.setPaused(!state.model.status.paused)
                        }
                    }
                }
            }
            Section {
                if state.codeSummaries.isEmpty {
                    Text("No code folders yet. Add the folders that hold your projects.")
                        .foregroundStyle(.secondary)
                }
                ForEach(state.codeSummaries) { summary in
                    FolderStatusRow(summary: summary) { removing = summary }
                }
            } header: {
                Text("Code folders")
            } footer: {
                HStack {
                    Button(action: state.addCodeFolders) {
                        Label(state.model.hasCode ? "Add Folders…" : "Choose Code Folders…", systemImage: "plus")
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
                                Image(systemName: "minus.circle.fill").foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                            .help("Search this folder's code again")
                        }
                    }
                    if state.model.settings.codeExcluded.isEmpty {
                        Text("None. What git ignores, vendored and generated code are skipped anyway.")
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Skip these folders")
                } footer: {
                    HStack {
                        Button {
                            state.app.pickFolders(for: NSApp.keyWindow, prompt: "Skip") { folders in
                                guard !folders.isEmpty else { return }
                                let excluded = state.model.settings.codeExcluded
                                state.app.applyCodeFolders(state.model.settings.codeRoots,
                                                           excluded: excluded + folders.filter { !excluded.contains($0) })
                            }
                        } label: {
                            Label("Skip a Folder…", systemImage: "plus")
                        }
                        Spacer()
                    }
                }
            }
            Section {
                Toggle(isOn: Binding(get: { state.model.settings.indexOnBattery },
                                     set: { state.app.setIndexOnBattery($0) })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(AppSettings.batteryTitle)
                        Text(AppSettings.batteryDetail)
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                }
                Toggle(isOn: Binding(get: { state.model.settings.indexHoursOn }, set: { on in
                    state.app.setIndexHours(on: on, hours: state.model.settings.indexHours)
                })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Index only at set hours")
                        Text("Files are read only between these times, and what changed meanwhile is picked up when "
                             + "they begin. Search works all day.")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if state.model.settings.indexHoursOn {
                    LabeledContent("From") {
                        HStack(spacing: 6) {
                            DatePicker("From", selection: time(\.start), displayedComponents: .hourAndMinute)
                                .labelsHidden()
                            Text("to")
                            DatePicker("To", selection: time(\.end), displayedComponents: .hourAndMinute)
                                .labelsHidden()
                        }
                    }
                }
            }
            Section {
                Picker("Open code in", selection: Binding(get: { CodeEditor.chosen(state.model.settings.codeEditor).id },
                                                          set: { state.app.setCodeEditor($0) })) {
                    ForEach(CodeEditor.installed) { editor in Text(editor.name).tag(editor.id) }
                    Text(CodeEditor.defaultApp.name).tag(CodeEditor.defaultApp.id)
                }
            } footer: {
                Text("A place opens there at the line that matched.")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
            AnswerSettings()
            Section {
                Text("The code index keeps your code's text on this Mac. It skips what git ignores, vendored and "
                     + "generated code, data files, and anything that looks like a key or a password.")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if state.model.hasCode {
                    HStack {
                        Spacer()
                        Button("Turn Off Code Search…", role: .destructive) { turningOff = true }
                    }
                }
            }
        }
        .formStyle(.grouped)
        .scrollDisabled(true)
        .onChange(of: state.model.status) { state.statusChanged() }
        .confirmationDialog("Turn off code search?", isPresented: $turningOff) {
            Button("Turn Off", role: .destructive) {
                state.app.applyCodeFolders([], excluded: [])
                Task { await state.refresh() }
            }
        } message: {
            Text("The code index (\(bytes(state.codeIndexSize))) is deleted. Turning it on again reads the code again.")
        }
        .confirmationDialog("Stop searching the code in “\(removing.map { ($0.path as NSString).lastPathComponent } ?? "")”?",
                            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } })) {
            Button("Remove", role: .destructive) {
                guard let removing else { return }
                state.app.removeCodeFolder(URL(fileURLWithPath: removing.path))
                Task { await state.refresh() }
            }
        } message: {
            Text("Its \(removing?.files.formatted() ?? "") code files leave the code index.")
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

/// Answers in the Ask window: who writes them (Pi, with its model), and what goes to that model.
private struct AnswerSettings: View {
    @State private var pi = AgentRunner.locate()

    var body: some View {
        Section {
            LabeledContent("Answers by") {
                if let pi {
                    Text("Pi, at \(tildePath(pi.path))").foregroundStyle(.secondary)
                } else {
                    Button("Copy Install Command") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(AnswerSheet.installCommand, forType: .string)
                    }
                }
            }
        } header: {
            Text("Answers")
        } footer: {
            Text("Pi writes answers with the model it's set up with. Your question and the places Gafitas found go to "
                 + "that model, and Gafitas asks before the first time one isn't on this Mac. With a local model, "
                 + "nothing leaves.")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
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
                Image(systemName: "arrow.right.circle.fill").foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .help("Show in Finder")
    }
}
