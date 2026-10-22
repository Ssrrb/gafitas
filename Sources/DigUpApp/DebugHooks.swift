import AppKit
import ServiceManagement
import SwiftUI

/// Launch arguments for testing without clicks or keystrokes (the terminal has no Accessibility permission):
///
///     -debugOffscreen YES     build and draw windows but never show them or activate the app, so
///                             snapshot runs don't take the keyboard from whoever is at the Mac
///     -debugMenu YES          log the menu once the index is open, then run Pause and Resume and log it again
///     -debugSnapshot <png>    draw the window -debugWindow opens into <png>, once it has loaded
///     -debugLoginItem YES     turn open-at-login on, log what macOS says, then off again (a signed build in
///                             /Applications; macOS shows a notification)
///     -debugQuit YES          quit after that
///     -debugPauseAfter S / -debugResumeAfter S   press Pause / Resume S seconds after launch
///     -debugCodeFolders a:b|off -debugCodeFoldersAfter S   choose these code folders S seconds after launch (as
///                             Settings would; "off" turns code search off)
///     -debugIcon <png>        draw the menubar icon idle, at 0%, 42% and 90%, and paused (at 4×, 2× and 1×)
///     -debugHotkeyCheck a,b   log what the shortcut recorder would say about each combination ("cmd+space"…)
///     -debugDialogs <png>     draw the privacy sheet, the delete-chat alert and the delete-history alert into
///                             <png>-privacy.png, -delete.png, -history.png (with -debugAskChat ID, the sheet counts
///                             that chat's places; without -debugOffscreen the alerts show for a moment, so the
///                             window server draws their glass)
///     -debugMenuView <png>    draw the top of the menu (status, detail, progress) into <png>, after
///                             -debugMenuViewAfter seconds
///     -debugWindow PAGE       open a window and snapshot it:
///                             settings:general|code|storage, settings:addcode (Code with its folders' sheet open),
///                             onboarding:welcome|code|shortcut|ready, ask (with -debugQuery as the question,
///                             -debugAskAnswer YES to ask for the answer and wait for it, -debugAskChat ID to reopen a
///                             saved chat instead, -debugAskFollowUp "…" to ask that next in the same chat,
///                             -debugAskOpen YES to click the first piece (-debugDryOpen YES: only log where it opens),
///                             -debugWindowSize 980x620; -debugApproveProviders YES skips the privacy sheet; the
///                             whole answer page also goes to <snapshot>-answer.png)
///                             (-debugCloseWindow YES closes it afterwards, to measure what closing gives back;
///                             -debugWindowAfter S opens it S seconds after launch, once the helper has reported)
///     -debugChoices "open:code;click:code/requests;add:<path>"   before the snapshot, act on the folder list of
///                             onboarding's code step or of the code sheet, then log what it would apply. Actions,
///                             `;`-separated: open:NAME (show a folder's subfolders), click:NAME (a folder's
///                             checkbox) or click:NAME/SUB (a subfolder's), add:PATH and skip:PATH (as picked in the
///                             open panel), unskip:PATH, types:heic,txt. NAME is the end of a listed folder's path.
///     -debugAdd YES           after the snapshot, press the code sheet's Add and log what it applied
///     -debugUseModelFiles a:b take these files as the model, as Use Files… does, a second after launch
///     -debugHelperArgs "…"    more arguments for the indexing helper, in dev runs ("--time-limit 0")
///     -debugQuitAfter S       log the menu and quit S seconds after launch
///     -debugWaitForIndex YES  wait for the model and an idle index with nothing waiting, as -debugOnboarding auto ends
///     -debugOnboarding auto   first launch, start to finish: snapshot each onboarding step (<snapshot>-1-welcome.png
///                             …), continue through it (the download starts, the folders apply), then wait for the
///                             model and the first index
///     -codeLocations a:b      the folders offered for code search (dev runs offer none without it)
enum DebugHooks {
    /// A debug run that decides what to show (the window a launch by hand opens would get in its way).
    static var drivesUI: Bool {
        ["debugOnboarding", "debugWindow", "debugLoginItem", "debugWaitForIndex", "debugMenu", "debugMenuView", "debugDialogs",
         "debugIcon"].contains { UserDefaults.standard.object(forKey: $0) != nil }
    }

    static func run(_ app: AppController) {
        _ = launched   // first-launch stamps count from here
        let defaults = UserDefaults.standard
        if defaults.string(forKey: "debugOnboarding") == "auto" {
            return runOnboarding(app)
        }
        if let page = defaults.string(forKey: "debugWindow") {
            return showWindow(page, app)
        }
        if defaults.bool(forKey: "debugLoginItem") {
            return loginItem(app)
        }
        if defaults.bool(forKey: "debugWaitForIndex") {
            return waitForFirstIndex(app)
        }
        if defaults.object(forKey: "debugPauseAfter") != nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + defaults.double(forKey: "debugPauseAfter")) {
                log("debug: Pause")
                app.engine.setPaused(true)
            }
        }
        if defaults.object(forKey: "debugResumeAfter") != nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + defaults.double(forKey: "debugResumeAfter")) {
                log("debug: Resume")
                app.engine.setPaused(false)
            }
        }
        if let folders = defaults.string(forKey: "debugCodeFolders") {
            DispatchQueue.main.asyncAfter(deadline: .now() + defaults.double(forKey: "debugCodeFoldersAfter")) {
                log("debug: code folders → \(folders)")
                app.applyCodeFolders(folders == "off" ? [] : folders.split(separator: ":").map {
                    AppSettings.folderURL(String($0))
                }, excluded: [])
            }
        }
        if let files = defaults.string(forKey: "debugUseModelFiles") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                log("debug: model files chosen: \(files)")
                app.model.download.use(files.split(separator: ":").map { URL(fileURLWithPath: String($0)) })
            }
        }
        if defaults.object(forKey: "debugQuitAfter") != nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + defaults.double(forKey: "debugQuitAfter")) {
                log("debug: menu \(app.statusMenu.describeMenu())")
                log("debug: quitting")
                NSApp.terminate(nil)
            }
        }
        if let path = defaults.string(forKey: "debugIcon") {
            drawIcons(to: URL(fileURLWithPath: (path as NSString).expandingTildeInPath))
        }
        if let list = defaults.string(forKey: "debugHotkeyCheck") {
            // What the shortcut recorder would say about each combination (nothing is saved or kept registered).
            for spec in list.split(separator: ",").map(String.init) {
                guard let combo = KeyCombo(spec) else {
                    log("hotkey check: \(spec): not a usable combination")
                    continue
                }
                let free = combo == app.model.hotkey || GlobalHotkey(combo, action: {}) != nil
                log("hotkey check: \(combo.display): " + (combo.systemConflict ?? (free ? "free" : "taken by another app")))
            }
        }
        if let path = defaults.string(forKey: "debugDialogs") {
            if let id = defaults.string(forKey: "debugAskChat") { app.openChat(id) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                drawDialogs(app, to: URL(fileURLWithPath: (path as NSString).expandingTildeInPath))
                if defaults.bool(forKey: "debugQuit") { NSApp.terminate(nil) }
            }
            return
        }
        if let path = defaults.string(forKey: "debugMenuView") {
            DispatchQueue.main.asyncAfter(deadline: .now() + defaults.double(forKey: "debugMenuViewAfter")) {
                drawMenuHeader(app, to: URL(fileURLWithPath: (path as NSString).expandingTildeInPath))
            }
        }
        if defaults.bool(forKey: "debugMenu") {
            let menu = app.statusMenu!
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                log("menu: \(menu.describeMenu())")
                menu.performItem(titled: "Pausar la lectura")
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    log("menu after Pause: \(menu.describeMenu())")
                    menu.performItem(titled: "Reanudar la lectura")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        log("menu after Resume: \(menu.describeMenu())")
                    }
                }
            }
        }
    }

    private static func snapshotPath(_ suffix: String? = nil) -> URL? {
        guard let path = UserDefaults.standard.string(forKey: "debugSnapshot") else { return nil }
        let full = (path as NSString).expandingTildeInPath
        guard let suffix else { return URL(fileURLWithPath: full) }
        return URL(fileURLWithPath: (full as NSString).deletingPathExtension + "-\(suffix).png")
    }

    private static func save(_ name: String, _ draw: (URL) throws -> Void, to url: URL?) {
        guard let url else { return }
        do {
            try draw(url)
            log("snapshot: \(name) → \(url.path)")
        } catch {
            log("snapshot of \(name) failed: \(error)")
        }
    }

    /// Views that load asynchronously (code cards, the answer page) get a moment before drawing.
    private static func whenPicturesSettle(_ body: @escaping () -> Void) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { body() }
    }

    // MARK: Windows

    private static func showWindow(_ page: String, _ app: AppController) {
        let defaults = UserDefaults.standard
        let started = Date()
        let parts = page.split(separator: ":").map(String.init)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5 + defaults.double(forKey: "debugWindowAfter")) {
            let loaded: () -> Bool
            let draw: (URL) throws -> Void
            let close: () -> Void
            var choices: () -> FolderChoices? = { nil }
            switch parts[0] {
            case "settings" where parts.count > 1 && parts[1] == "addcode":
                app.showSettings(.code)
                app.settingsWindow.addCodeFolders()
                let sheet = app.settingsWindow.codeSheet
                choices = { sheet.choices }
                loaded = { app.settingsWindow.state.isLoaded && sheet.choices?.estimatesDone ?? false }
                draw = { try sheet.snapshot(to: $0) }
                close = { sheet.end() }
            case "settings":
                let tab = SettingsTab(rawValue: parts.count > 1 ? parts[1] : "general") ?? .general
                app.showSettings(tab)
                loaded = { app.settingsWindow.state.isLoaded }
                draw = { try app.settingsWindow.snapshot(to: $0) }
                close = {}
            case "onboarding":
                app.showOnboarding()
                let onboarding = app.onboarding!
                if parts.count > 1, let step = OnboardingState.Step.allCases.first(where: { "\($0)" == parts[1] }) {
                    onboarding.state.go(to: step)
                }
                choices = { onboarding.state.step == .code ? onboarding.state.codeFolders : nil }
                loaded = { onboarding.state.isLoaded }
                draw = { try onboarding.snapshot(to: $0) }
                close = { onboarding.close() }
            case "ask":
                app.showAsk(question: defaults.string(forKey: "debugQuery") ?? "")
                let ask = app.askWindow.ask
                Opener.dryRun = defaults.bool(forKey: "debugDryOpen")
                let reopened = defaults.string(forKey: "debugAskChat")
                if let reopened { app.openChat(reopened) }
                let answering = defaults.bool(forKey: "debugAskAnswer")
                let followUp = defaults.string(forKey: "debugAskFollowUp")
                var shot = false
                let settled = { ask.answer == .done || { if case .failed = ask.answer { true } else { false } }() }
                // The figure settles, then WebKit draws it, on screen and as the whole page.
                let capture = {
                    log("ask: answer \(ask.answer)")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        if defaults.bool(forKey: "debugAskOpen") {
                            ask.bridge.webView.evaluateJavaScript("document.querySelector('button.g-tile')?.click()")
                        }
                        app.askWindow.captureAnswer { shot = true }
                    }
                }
                let thenFollowUp = {
                    guard let followUp else { return capture() }
                    ask.followUp = followUp
                    ask.sendFollowUp()
                    waitUntil({ settled() }, deadline: Date().addingTimeInterval(300)) { capture() }
                }
                if answering {
                    waitUntil({ ask.dug }, deadline: Date().addingTimeInterval(30)) { ask.askNow() }
                    waitUntil({ ask.chat != nil && settled() }, deadline: Date().addingTimeInterval(300), then: thenFollowUp)
                } else if reopened != nil {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { thenFollowUp() }
                }
                loaded = { answering || reopened != nil ? shot : ask.trimmed.isEmpty || ask.dug }
                draw = { url in
                    try app.askWindow.snapshot(to: url)
                    if let page = app.askWindow.pageShot, let full = snapshotPath("answer") {
                        try Snapshot.write(page, background: NSColor(Brand.sheet), appearance: NSApp.effectiveAppearance, to: full)
                        log("snapshot: the whole answer → \(full.path)")
                    }
                }
                close = { app.askWindow.close() }
            default:
                return log("window: don't know \"\(page)\"")
            }
            let long = defaults.bool(forKey: "debugAskAnswer") || defaults.string(forKey: "debugAskFollowUp") != nil
            waitUntil(loaded, deadline: Date().addingTimeInterval(long ? 660 : 30)) {
                log("window: \(page) loaded in \(ms(since: started)) (after a 0.5 s launch delay)")
                if let list = choices() { act(on: list) }
                waitUntil({ choices()?.estimatesDone ?? true }, deadline: Date().addingTimeInterval(30)) {
                    whenPicturesSettle {
                        save(page, draw, to: snapshotPath())
                        if let list = choices() { log("choices: \(describe(list))") }
                        if defaults.bool(forKey: "debugAdd"), app.settingsWindow.codeSheet.isOpen {
                            app.settingsWindow.codeSheet.add()
                            let settings = app.model.settings
                            log("debug: added; code folders \(settings.codeRoots.map { tildePath($0.path) }) · "
                                + "skipping \(settings.codeExcluded.map { tildePath($0.path) })")
                        }
                        if defaults.bool(forKey: "debugCloseWindow") {
                            close()
                            log("window: closed")
                        }
                        if defaults.bool(forKey: "debugQuit") { NSApp.terminate(nil) }
                    }
                }
            }
        }
    }

    // MARK: Open at login

    private static func loginItem(_ app: AppController) {
        func status() -> String {
            switch SMAppService.mainApp.status {
            case .enabled: "enabled"
            case .requiresApproval: "requires approval (System Settings → Login Items)"
            case .notRegistered: "not registered"
            case .notFound: "not found"
            @unknown default: "unknown"
            }
        }
        log("login item: \(status()) at first · app at \(Bundle.main.bundlePath)")
        let on = app.setLaunchAtLogin(true)
        log("login item: turned on → \(on ?? "ok"), now \(status())")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            let off = app.setLaunchAtLogin(false)
            log("login item: turned off → \(off ?? "ok"), now \(status())")
            if UserDefaults.standard.bool(forKey: "debugQuit") { NSApp.terminate(nil) }
        }
    }

    // MARK: First launch, start to finish

    private static let launched = Date()

    private static func stamp(_ what: String) {
        log("first launch: \(what) at \(String(format: "%.1f s", Date().timeIntervalSince(launched)))")
    }


    private static func runOnboarding(_ app: AppController) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            guard let onboarding = app.onboarding else {
                log("first launch: onboarding didn't open (folders or onboarded already set?)")
                return NSApp.terminate(nil)
            }
            stamp("onboarding open")
            onboardingStep(0, onboarding, app)
        }
    }

    /// Snapshots step `index` (of the steps this Mac gets), then presses its Continue (Get Started, Continue…, Done).
    /// On the code step, `-debugChoices` acts on the list first.
    private static func onboardingStep(_ index: Int, _ onboarding: OnboardingController, _ app: AppController) {
        let state = onboarding.state
        guard index < state.steps.count else { return waitForFirstIndex(app) }
        let name = "\(index + 1)-\(state.step)"
        waitUntil({ state.isLoaded }, deadline: Date().addingTimeInterval(60)) {
            if state.step == .code { act(on: state.codeFolders) }
            waitUntil({ state.isLoaded }, deadline: Date().addingTimeInterval(60)) {
                whenPicturesSettle {
                    save(name, { try onboarding.snapshot(to: $0) }, to: snapshotPath(name))
                    if state.step == .code { log("choices: \(describe(state.codeFolders))") }
                    stamp("step \(name) done")
                    state.next()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { onboardingStep(index + 1, onboarding, app) }
                }
            }
        }
    }

    // MARK: Folder lists

    /// `-debugChoices`: clicks and picks in a folder list, as described at the top.
    private static func act(on choices: FolderChoices) {
        guard let script = UserDefaults.standard.string(forKey: "debugChoices") else { return }
        func row(_ name: String) -> URL? { choices.rows.first { $0.path.hasSuffix("/" + name) } }
        for action in script.split(separator: ";").map(String.init) {
            let parts = action.split(separator: ":", maxSplits: 1).map(String.init)
            guard parts.count == 2 else { continue }
            let (verb, name) = (parts[0], parts[1])
            switch verb {
            case "open":
                if let row = row(name) { choices.expanded.insert(row.path) } else { log("choices: no folder \(name)") }
            case "click":
                if let row = row(name) {
                    choices.toggle(row)
                } else if let row = row((name as NSString).deletingLastPathComponent) {
                    choices.toggle(subfolder: row.path + "/" + (name as NSString).lastPathComponent)
                } else {
                    log("choices: no folder \(name)")
                }
            case "add": choices.add([AppSettings.folderURL(name)])
            case "skip": choices.skip([AppSettings.folderURL(name)])
            case "unskip": choices.unskip(AppSettings.folderURL(name).path)
            case "types": choices.setTypes(name)
            default: log("choices: don't know \"\(verb)\"")
            }
            log("choices: \(action) → \(describe(choices))")
        }
    }

    /// What a folder list would apply, and how it shows.
    private static func describe(_ choices: FolderChoices) -> String {
        let marks = choices.rows.map { row in
            "\(row.lastPathComponent) \(choices.mark(row))"
                + (choices.searchedPart(of: row).map { String(format: " %.1f s", $0.seconds) } ?? "")
        }
        return "folders \(choices.roots.map { tildePath($0.path) }) · skipping \(choices.skipped.map { tildePath($0.path) })"
            + " · rows [\(marks.joined(separator: ", "))] · first pass ≈ \(roughDuration(choices.totalSeconds))"
            + (choices.note.map { " · note: \($0)" } ?? "")
    }

    private static func waitForFirstIndex(_ app: AppController) {
        var lastLog = Date()
        let finished = {
            if Date().timeIntervalSince(lastLog) > 10 {
                lastLog = Date()
                log("first launch: waiting · \(app.model.statusLine) · model \(app.download.progressText)")
            }
            let code = app.model.status.code
            guard app.download.isReady, case .idle = app.model.status.activity, code.indexing == nil else { return false }
            return code.pending == 0 && code.searchable > 0
        }
        waitUntil(finished, deadline: Date().addingTimeInterval(45 * 60)) {
            stamp("model ready and first index done (\(app.model.statusLine))")
            if UserDefaults.standard.bool(forKey: "debugQuit") { NSApp.terminate(nil) }
        }
    }

    private static func waitUntil(_ condition: @escaping () -> Bool, deadline: Date, then body: @escaping () -> Void) {
        if condition() || Date() > deadline { return body() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { waitUntil(condition, deadline: deadline, then: body) }
    }

    /// The dialogs offscreen runs can't show: drawn from the same code the app runs them with.
    private static func drawDialogs(_ app: AppController, to url: URL) {
        let base = url.deletingPathExtension().path
        let sheet = NSHostingView(rootView: PrivacySheet(ask: app.askWindow.ask, provider: "opencode-go"))
        sheet.frame.size = sheet.fittingSize
        let window = NSWindow(contentRect: sheet.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = sheet
        save("privacy sheet", { try Snapshot.write(window, to: $0) }, to: URL(fileURLWithPath: base + "-privacy.png"))
        let alerts = [("delete", AskModel.deleteAlert(questions: 2)), ("history", SettingsState.historyAlert())]
        for (name, alert) in alerts {
            alert.layout()
            let file = URL(fileURLWithPath: base + "-\(name).png")
            if AppController.offscreen {
                save("\(name) alert", { try Snapshot.write(alert.window, to: $0) }, to: file)
                continue
            }
            // cacheDisplay draws an alert's glass as blank white in dark mode: shown for a moment (the app isn't
            // activated), the window server draws it as it really looks.
            alert.window.center()
            alert.window.orderFrontRegardless()
            RunLoop.main.run(until: Date().addingTimeInterval(0.6))
            save("\(name) alert", { try Snapshot.capture(alert.window, to: $0) }, to: file)
            alert.window.orderOut(nil)
        }
    }

    /// The menu's header view, as it would show if the menu opened now.
    private static func drawMenuHeader(_ app: AppController, to url: URL) {
        let view = NSHostingView(rootView: MenuStatusView(model: app.model))
        view.frame.size = view.fittingSize
        let window = NSWindow(contentRect: view.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = view
        save("menu header", { try Snapshot.write(window, to: $0, cornerRadius: 6) }, to: url)
    }

    /// The menubar icon idle, at a few progress values and paused, black on white (as a template it takes the bar's
    /// color): scaled up 4×, and under it at the bar's own 2× and 1× pixels.
    private static func drawIcons(to url: URL) {
        let states: [(Double?, Bool)] = [(nil, false), (0.0, false), (0.42, false), (0.9, false), (nil, true)]
        let scale: CGFloat = 4, side: CGFloat = 18
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(side * scale) * states.count,
                                   pixelsHigh: Int(side * (scale + 3)), bitsPerSample: 8, samplesPerPixel: 4,
                                   hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0,
                                   bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        NSColor.white.setFill()
        NSRect(x: 0, y: 0, width: rep.pixelsWide, height: rep.pixelsHigh).fill()
        for (index, (progress, paused)) in states.enumerated() {
            let image = StatusIcon.image(progress: progress, paused: paused)
            let x = CGFloat(index) * side * scale
            image.draw(in: NSRect(x: x, y: side * 3, width: side * scale, height: side * scale))
            image.draw(in: NSRect(x: x, y: side, width: side * 2, height: side * 2))
            image.draw(in: NSRect(x: x + side * 2, y: 0, width: side, height: side))
        }
        NSGraphicsContext.restoreGraphicsState()
        try? rep.representation(using: .png, properties: [:])?.write(to: url)
        log("icon: \(url.path)")
    }
}
