import AppKit
import DigUpKit
import ServiceManagement

/// Owns the app's parts (engine, model download, hotkey, windows, menu) and carries out what they ask for:
/// new folders, a new hotkey, the login item, which window to show.
final class AppController {
    /// `-debugOffscreen YES`: windows are built and drawn but never shown, and the app never activates,
    /// so snapshot tests don't take the keyboard from whoever is using the Mac.
    static let offscreen = UserDefaults.standard.bool(forKey: "debugOffscreen")

    let model: AppModel
    let engine: Engine
    let download: ModelDownload
    let hotkeys = HotkeyCenter()
    private let power: PowerPolicy
    private let schedule: IndexSchedule
    private(set) var askWindow: AskWindowController!
    private(set) var settingsWindow: SettingsWindowController!
    private(set) var statusMenu: StatusMenuController!
    private(set) var onboarding: OnboardingController?
    private var observers: [NSObjectProtocol] = []
    /// Set while onboarding's shortcut step waits for you to try the hotkey: a press goes there, not to the Ask window.
    var hotkeyTester: (() -> Void)?

    init(settings: AppSettings) {
        let download = ModelDownload(folder: settings.modelsDirectory)
        let model = AppModel(settings: settings, download: download)
        var engineRef: Engine?
        let power = PowerPolicy(indexOnBattery: settings.indexOnBattery) { blocker in
            engineRef?.setBackfillBlocker(blocker)
        }
        log("power: \(PowerPolicy.onACPower() ? "AC" : "battery"), backfill \(power.blocker.map { "waits (\($0))" } ?? "may run")")
        let schedule = IndexSchedule(hours: settings.indexHoursOn ? settings.indexHours : nil) { until in
            engineRef?.setHeldUntil(until)
        }
        if let until = schedule.waitsUntil {
            log("schedule: indexing waits until \(until.formatted(date: .omitted, time: .shortened))")
        }
        let engine = Engine(settings: settings, backfillBlocker: power.blocker,
                            heldUntil: schedule.waitsUntil) { status in
            let before = model.statusLine
            model.status = status
            if model.statusLine != before { log("status: \(model.statusLine)") }
        }
        engineRef = engine
        Estimates.indexDirectory = settings.indexDirectory
        self.download = download
        self.model = model
        self.power = power
        self.schedule = schedule
        self.engine = engine
    }

    /// `showWindow`: opened by hand (not at login), so the Ask window comes up once the app is set up.
    func start(showWindow: Bool = false) {
        askWindow = AskWindowController(app: self)
        settingsWindow = SettingsWindowController(app: self)
        statusMenu = StatusMenuController(model: model)
        statusMenu.onAsk = { [weak self] in self?.showAsk() }
        statusMenu.onSettings = { [weak self] in self?.showSettings() }
        statusMenu.onPauseChanged = { [weak self] paused in self?.engine.setPaused(paused) }

        hotkeys.onPress = { [weak self] in
            guard let self else { return }
            if let hotkeyTester { hotkeyTester() } else { showAsk() }
        }
        if let combo = KeyCombo(model.settings.hotkey) {
            model.hotkey = hotkeys.register(combo) ? combo : nil
            log(model.hotkey == nil ? "hotkey \(combo.display) is taken by another app" : "hotkey \(combo.display)")
        } else {
            log("hotkey: can't read \"\(model.settings.hotkey)\" (try opt+shift+space)")
        }

        Previews.shared.passage = { [engine] id, code in await engine.text(ofSegment: id, code: code) }
        CodeEditor.current = CodeEditor.chosen(model.settings.codeEditor)
        download.onReady = { [weak self] in self?.engine.modelArrived() }
        engine.start()
        let settings = model.settings
        if !settings.onboarded, settings.codeRoots.isEmpty {
            showOnboarding()
        } else {
            // Set up already (the go-ahead came with onboarding), so a missing model just downloads.
            if !download.isReady { download.start() }
            if showWindow { showAsk() }
        }
        for name in [NSWorkspace.didMountNotification, NSWorkspace.didUnmountNotification] {
            observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName: name, object: nil,
                                                                               queue: .main) { [weak self] note in
                let volume = (note.userInfo?[NSWorkspace.volumeURLUserInfoKey] as? URL)?.path
                MainActor.assumeIsolated { self?.volumeChanged(volume) }
            })
        }
    }

    /// A drive was connected or ejected: only a chosen folder on it (or one that's missing) is of interest.
    private func volumeChanged(_ volume: String?) {
        guard let volume else { return }
        let prefix = volume.hasSuffix("/") ? volume : volume + "/"
        let affected = (model.settings.roots + model.settings.codeRoots).contains {
            $0.path == volume || $0.path.hasPrefix(prefix)
        } || !model.status.missingRoots.isEmpty || !model.status.code.missingRoots.isEmpty
        guard affected else { return }
        log("volume: \(volume) came or went")
        engine.volumesChanged()
    }

    // MARK: Code search

    /// The code folders from now on (none turns code search off and deletes the code index), and those skipped in
    /// them, by `FolderSelection`'s rule.
    func applyCodeFolders(_ roots: [URL], excluded: [URL]) {
        let selection = FolderSelection(chosen: roots.map { AppSettings.folderURL($0.path).path },
                                        skipped: excluded.map(\.path))
        let roots = selection.folders.map(AppSettings.folderURL)
        let excluded = selection.effectiveSkips.map(AppSettings.folderURL)
        guard roots != model.settings.codeRoots || excluded != model.settings.codeExcluded else { return }
        AppSettings.save(codeRoots: roots, excluded: excluded)
        model.settings.codeRoots = roots
        model.settings.codeExcluded = excluded
        engine.setCodeFolders(roots: roots, excluded: excluded)
    }

    func removeCodeFolder(_ root: URL) {
        applyCodeFolders(model.settings.codeRoots.filter { $0.path != root.path },
                         excluded: model.settings.codeExcluded.filter { !FolderSelection.isInside($0.path, root.path) })
    }

    /// The editor code results open in (a bundle id; "" for each file's default app).
    func setCodeEditor(_ id: String) {
        AppSettings.save(codeEditor: id)
        model.settings.codeEditor = id
        CodeEditor.current = CodeEditor.chosen(id)
        log("code results open in \(CodeEditor.current.name)")
    }

    func setIndexOnBattery(_ on: Bool) {
        AppSettings.save(indexOnBattery: on)
        model.settings.indexOnBattery = on
        power.setIndexOnBattery(on)
    }

    /// "Index only at set hours": on or off, and the hours (kept while it's off).
    func setIndexHours(on: Bool, hours: IndexHours) {
        AppSettings.save(indexHoursOn: on, hours: hours)
        model.settings.indexHoursOn = on
        model.settings.indexHours = hours
        schedule.setHours(on ? hours : nil)
    }

    /// Asks for folders with the standard open panel (as a sheet when there's a window).
    func pickFolders(for window: NSWindow?, prompt: String = "Add", then done: @escaping ([URL]) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = true
        panel.canCreateDirectories = false
        panel.prompt = prompt
        panel.message = "Choose folders with code for Gafitas to read."
        let finish = { (response: NSApplication.ModalResponse) in
            done(response == .OK ? panel.urls.map { AppSettings.folderURL($0.path) } : [])
        }
        if let window { panel.beginSheetModal(for: window, completionHandler: finish) } else { finish(panel.runModal()) }
    }

    /// Settings → Code with its folders' sheet open.
    func chooseCodeFolders() {
        showSettings(.code)
        settingsWindow.addCodeFolders()
    }

    // MARK: Hotkey

    /// Nil when `combo` is now the hotkey, else why it can't be.
    func setHotkey(_ combo: KeyCombo) -> String? {
        if let conflict = combo.systemConflict { return conflict }
        guard hotkeys.register(combo) else { return "Another app is using \(combo.display)" }
        AppSettings.save(hotkey: combo.spec)
        model.settings.hotkey = combo.spec
        model.hotkey = combo
        log("hotkey: \(combo.display)")
        return nil
    }

    /// The shortcut recorder is listening (the hotkey steps aside so pressing it reaches the recorder).
    func hotkeyRecording(_ on: Bool) {
        if on { hotkeys.suspend() } else { hotkeys.resume() }
    }

    // MARK: Login item

    var launchesAtLogin: Bool { SMAppService.mainApp.status == .enabled }

    /// Dev builds (anywhere but /Applications) don't suggest it, so trying a build never adds a login item.
    var suggestsLaunchAtLogin: Bool { Bundle.main.bundlePath.hasPrefix("/Applications/") }

    /// Nil when done, else why it failed.
    func setLaunchAtLogin(_ on: Bool) -> String? {
        guard on != launchesAtLogin else { return nil }
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            log("login item: \(on ? "on" : "off")")
            return nil
        } catch {
            log("login item: \(error)")
            return error.localizedDescription
        }
    }

    // MARK: Windows

    /// A saved chat from the history (the menu bar's Recientes), drawn from its log.
    func openChat(_ id: String) {
        askWindow.show()
        askWindow.ask.open(chat: id)
    }

    /// Where every chat is kept.
    var chatLog: ChatLog { ChatLog(index: model.settings.indexDirectory) }

    func showAsk(question: String? = nil) {
        askWindow.show(question: question)
    }

    func showSettings(_ tab: SettingsTab = .general) {
        settingsWindow.show(tab)
    }

    func showOnboarding() {
        let onboarding = self.onboarding ?? OnboardingController(app: self)
        self.onboarding = onboarding
        onboarding.show()
    }

    /// Onboarding closed: by Done, or by its close button. Code folders chosen by then count as set up.
    func onboardingClosed() {
        hotkeyTester = nil
        if model.hasCode {
            AppSettings.saveOnboarded()
            model.settings.onboarded = true
        }
        onboarding = nil
        windowClosed()
    }

    /// Brings a window forward, with the Dock icon showing while any window is open. Offscreen test runs only build it.
    func present(_ window: NSWindow) {
        guard !Self.offscreen else { return }
        NSApp.setActivationPolicy(.regular)
        bringAppToFront()
        window.makeKeyAndOrderFront(nil)
    }

    /// A window closed: the Dock icon goes once none is left.
    func windowClosed() {
        DispatchQueue.main.async { [self] in
            let open = [askWindow?.isVisible, settingsWindow?.isVisible, onboarding?.isVisible].contains { $0 == true }
            if !open { NSApp.setActivationPolicy(.accessory) }
        }
    }
}
