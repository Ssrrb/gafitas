import AppKit
import DigUpKit
import Observation
import SwiftUI

/// First launch, in four steps: what Gafitas does, which folders hold your code (with how long reading them takes),
/// the hotkey (try it), and done. The model downloads from Get Started on, shown at the bottom of every later step, and
/// the chosen folders start indexing as soon as you continue past them.
final class OnboardingController: NSObject, NSWindowDelegate {
    let state: OnboardingState
    private unowned let app: AppController
    private var window: NSWindow?

    init(app: AppController) {
        self.app = app
        state = OnboardingState(app: app)
    }

    var isVisible: Bool { window?.isVisible == true }

    func show() {
        let window = self.window ?? makeWindow()
        app.present(window)
    }

    func close() {
        window?.close()
    }

    private func makeWindow() -> NSWindow {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: OnboardingView.size.width,
                                                  height: OnboardingView.size.height),
                              styleMask: [.titled, .closable, .fullSizeContentView], backing: .buffered, defer: false)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isMovableByWindowBackground = true
        window.title = "Welcome to Gafitas"
        window.isReleasedWhenClosed = false
        window.delegate = self
        state.close = { [weak self] in self?.close() }
        window.contentView = NSHostingView(rootView: OnboardingView(state: state))
        window.center()
        self.window = window
        return window
    }

    func windowWillClose(_ notification: Notification) {
        state.leaving()
        window?.contentView = nil
        window = nil
        app.onboardingClosed()
    }

    func snapshot(to url: URL) throws {
        try Snapshot.write(window, to: url)
    }
}

@Observable
final class OnboardingState {
    enum Step: Int, CaseIterable {
        case welcome, code, shortcut, ready
    }

    private(set) var step = Step.welcome
    /// The folders with code (`CodeFolders`, and any you add), with their estimates and repos; applied on Continue.
    let codeFolders: FolderChoices
    /// You pressed the hotkey on the shortcut step.
    private(set) var hotkeyWorked = false
    var launchAtLogin: Bool
    var indexOnBattery: Bool
    @ObservationIgnored let app: AppController
    @ObservationIgnored var close: () -> Void = {}

    init(app: AppController) {
        self.app = app
        let settings = app.model.settings
        let codeCandidates = CodeFolders.candidates()
        codeFolders = FolderChoices(rows: codeCandidates,
                                    selection: FolderSelection(chosen: settings.codeRoots.isEmpty
                                                                   ? codeCandidates.map(\.path)
                                                                   : settings.codeRoots.map(\.path)),
                                    types: [], code: true)
        launchAtLogin = app.launchesAtLogin || app.suggestsLaunchAtLogin
        indexOnBattery = settings.indexOnBattery
    }

    var model: AppModel { app.model }
    var download: ModelDownload { app.download }

    var steps: [Step] { Step.allCases }

    // MARK: Steps

    func next() {
        switch step {
        case .welcome:
            download.start()   // the go-ahead for the one download
            go(to: .code)
        case .code:
            // Indexing starts now (once the model is in), while you set up the rest.
            app.applyCodeFolders(codeFolders.roots, excluded: codeFolders.skipped)
            go(to: .shortcut)
        case .shortcut:
            go(to: .ready)
        case .ready:
            finish()
        }
    }

    func back() {
        guard let index = steps.firstIndex(of: step), index > 0 else { return }
        go(to: steps[index - 1])
    }

    func go(to step: Step) {
        self.step = step
        app.hotkeyTester = step == .shortcut ? { [weak self] in self?.hotkeyWorked = true } : nil
        if step == .code { codeFolders.startEstimates() }
    }

    func finish() {
        if indexOnBattery != model.settings.indexOnBattery { app.setIndexOnBattery(indexOnBattery) }
        if launchAtLogin != app.launchesAtLogin { _ = app.setLaunchAtLogin(launchAtLogin) }
        log("onboarding: done (\(model.settings.codeRoots.count) code folders, login item \(launchAtLogin ? "on" : "off"))")
        close()
    }

    /// The window is closing (Done or its close button).
    func leaving() {
        app.hotkeyTester = nil
    }

    /// The step has what it needs to be drawn (debug snapshots wait for this).
    var isLoaded: Bool {
        switch step {
        case .code: codeFolders.estimatesDone
        default: true
        }
    }

    func addCodeFolders(from window: NSWindow?) {
        app.pickFolders(for: window) { [weak self] picked in
            guard !picked.isEmpty else { return }
            self?.codeFolders.add(picked)
        }
    }
}

// MARK: Views

struct OnboardingView: View {
    static let size = CGSize(width: 680, height: 600)
    @Bindable var state: OnboardingState

    var body: some View {
        VStack(spacing: 0) {
            Group {
                switch state.step {
                case .welcome: WelcomeStep()
                case .code: CodeStep(state: state)
                case .shortcut: ShortcutStep(state: state)
                case .ready: ReadyStep(state: state)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: state.step == .welcome ? .center : .top)
            .padding(.horizontal, 48)
            .padding(.top, 46)
            Divider()
            footer
        }
        .frame(width: Self.size.width, height: Self.size.height)
        .background(alignment: .top) {
            // A soft moss glow behind the top of each step, from the icon's colors.
            Brand.wash
                .frame(height: 260)
                .mask(LinearGradient(colors: [.black.opacity(0.10), .clear], startPoint: .top, endPoint: .bottom))
                .ignoresSafeArea()
        }
    }

    private var footer: some View {
        HStack(spacing: 14) {
            StepDots(current: state.steps.firstIndex(of: state.step) ?? 0, count: state.steps.count)
            if state.step != .welcome {
                DownloadStatus(download: state.download)
            }
            Spacer(minLength: 8)
            if state.step == .code {
                Text(codeSummary)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            if state.step != .welcome, state.step != .ready {
                Button("Back") { state.back() }
            }
            Button(continueTitle) { state.next() }
                .keyboardShortcut(.defaultAction)
                .disabled(state.step == .code && state.codeFolders.roots.isEmpty)
        }
        .controlSize(.large)
        .padding(.horizontal, 20)
        .frame(height: 64)
    }

    private var continueTitle: String {
        switch state.step {
        case .welcome: "Get Started"
        case .code: "Start Indexing"
        case .shortcut: "Continue"
        case .ready: "Done"
        }
    }

    private var codeSummary: String {
        guard !state.codeFolders.roots.isEmpty else { return "Check the folders with your code" }
        guard state.codeFolders.estimatesDone else { return "Looking at your code…" }
        let seconds = state.codeFolders.totalSeconds
        return (seconds < 1 ? "Under a second" : "About \(roughDuration(seconds))")
            + ", \(roughBytes(state.codeFolders.totalBytes))"
    }
}

private struct StepDots: View {
    let current: Int
    let count: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<count, id: \.self) { index in
                Circle()
                    .fill(index == current ? Color.primary.opacity(0.55) : Color.primary.opacity(0.15))
                    .frame(width: 6, height: 6)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Step \(current + 1) of \(count)")
    }
}

/// The model download, small: "Downloading the model · 42% · about 1 min left", then "Model ready".
struct DownloadStatus: View {
    let download: ModelDownload

    var body: some View {
        HStack(spacing: 7) {
            switch download.phase {
            case .ready:
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                Text("Model ready")
            case .failed(let message):
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                Text(message).lineLimit(1)
                Button("Try Again") { download.start() }.controlSize(.small)
                Button("Use Files…") { download.chooseFiles(for: NSApp.keyWindow) }
                    .controlSize(.small)
                    .help("Downloaded the model's two files somewhere else? Choose them here.")
            case .needed:
                Image(systemName: "arrow.down.circle").foregroundStyle(.secondary)
                Text("Model not downloaded")
                Button("Download") { download.start() }.controlSize(.small)
            default:
                ProgressView(value: download.fraction)
                    .progressViewStyle(.circular)
                    .controlSize(.small)
                Text("Downloading the model · \(download.progressText)")
                    .lineLimit(1)
            }
        }
        .font(.system(size: 12))
        .foregroundStyle(.secondary)
    }
}

private struct WelcomeStep: View {
    var body: some View {
        VStack(spacing: 0) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 96, height: 96)
                .shadow(color: Brand.moss.opacity(0.35), radius: 14, y: 6)
            Text("Gafitas")
                .font(.system(size: 30, weight: .bold))
                .padding(.top, 10)
            Text("Describe it. Dig it up.")
                .font(.system(size: 16))
                .foregroundStyle(.secondary)
                .padding(.top, 2)
            Text("Ask how your code works. Gafitas finds the places in your projects that answer it, on this Mac, "
                 + "and draws how they fit together.")
                .font(.system(size: 14))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: 470)
                .padding(.top, 30)
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "lock.shield")
                    .font(.system(size: 18))
                    .foregroundStyle(.secondary)
                    .frame(width: 30)
                Text("Your code is indexed and searched on this Mac. Gafitas downloads its AI model (865 MB) once. "
                     + "Next, Gafitas looks for folders with code to say how long each would take; nothing is indexed "
                     + "until you choose.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, 26)
            .frame(maxWidth: 470, alignment: .leading)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 40)
    }
}

struct StepTitle: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 24, weight: .bold))
            Text(subtitle)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The folders with code, each opening to its repos with how long reading them takes and the room their index needs,
/// and the editor places open in. Shown even when none were found: you add yours here.
private struct CodeStep: View {
    @Bindable var state: OnboardingState

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            StepTitle(title: "Where's your code?",
                      subtitle: "Pick the folders that hold your projects; open one to pick among its repos. Gafitas "
                          + "reads them on this Mac. You can change this anytime in Settings → Code.")
            ScrollView {
                VStack(spacing: 6) {
                    FolderList(choices: state.codeFolders, addTitle: "Add Folder…") {
                        state.addCodeFolders(from: NSApp.keyWindow)
                    }
                    CodeFolderNote().padding(.top, 4)
                }
            }
            .scrollBounceBehavior(.basedOnSize)
            HStack {
                Text("Open code in")
                Picker("Open code in", selection: Binding(get: { CodeEditor.chosen(state.model.settings.codeEditor).id },
                                                          set: { state.app.setCodeEditor($0) })) {
                    ForEach(CodeEditor.installed) { editor in Text(editor.name).tag(editor.id) }
                    Text(CodeEditor.defaultApp.name).tag(CodeEditor.defaultApp.id)
                }
                .labelsHidden()
                .fixedSize()
                Spacer()
            }
            .font(.system(size: 12))
            .padding(.bottom, 12)
        }
    }
}

private struct ShortcutStep: View {
    let state: OnboardingState

    var body: some View {
        VStack(spacing: 0) {
            StepTitle(title: "Open Gafitas from anywhere",
                      subtitle: "Press the shortcut in any app, ask about your code, and press Return.")
            ShortcutRecorder(combo: state.model.hotkey, apply: { state.app.setHotkey($0) },
                             listening: { state.app.hotkeyRecording($0) }, capSize: 20)
                .padding(.top, 34)
            Group {
                if state.hotkeyWorked {
                    Label("That's it. It works from any app.", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                } else if let hotkey = state.model.hotkey {
                    Text("Try it now: press \(hotkey.display).")
                        .foregroundStyle(.secondary)
                }
            }
            .font(.system(size: 13, weight: .medium))
            .padding(.top, 16)
            .animation(.default, value: state.hotkeyWorked)
        }
    }
}

private struct ReadyStep: View {
    @Bindable var state: OnboardingState

    var body: some View {
        VStack(spacing: 0) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 60))
                .foregroundStyle(Brand.gradient)
                .padding(.top, 8)
            Text("You're all set")
                .font(.system(size: 26, weight: .bold))
                .padding(.top, 14)
            Text(progressNote)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: 470)
                .padding(.top, 8)
            VStack(alignment: .leading, spacing: 16) {
                SwitchRow(title: "Open Gafitas when you log in", detail: "So the shortcut always works.",
                          isOn: $state.launchAtLogin)
                Divider()
                SwitchRow(title: AppSettings.batteryTitle, detail: AppSettings.batteryDetail,
                          isOn: $state.indexOnBattery)
            }
            .padding(20)
            .frame(maxWidth: 470, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.primary.opacity(0.04)))
            .padding(.top, 28)
            HStack(spacing: 8) {
                Image(systemName: "sparkle.magnifyingglass")
                Text("Gafitas lives in the menu bar, which shows how indexing is going.")
            }
            .font(.system(size: 12))
            .foregroundStyle(.secondary)
            .padding(.top, 22)
        }
        .frame(maxWidth: .infinity)
    }

    private var progressNote: String {
        let seconds = state.codeFolders.totalSeconds
        let time = seconds > 0 ? " (about \(roughDuration(seconds)) on this Mac)" : ""
        if state.download.isReady {
            return "Gafitas is reading your code\(time). You can ask right away; places fill in as it goes."
        }
        return "Gafitas starts reading your code\(time) once the model has downloaded "
            + "(\(state.download.progressText)). Until then, answers come from the model alone."
    }
}

/// A setting with a title, a line about it, and a switch on the right.
struct SwitchRow: View {
    let title: String
    let detail: String
    @Binding var isOn: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 13, weight: .medium))
                Text(detail)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Toggle(title, isOn: $isOn).labelsHidden().toggleStyle(.switch)
        }
    }
}
