import AppKit
import DigUpKit
import Observation
import SwiftUI

/// First launch, in four steps: what Gafitas does, which folders hold your code (with how long reading them takes),
/// the hotkey (try it), and done. The search model downloads from Empezar on, shown at the bottom of every later step,
/// and the chosen folders start being read as soon as you continue past them.
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
        window.title = "Gafitas"
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
            app.showAsk()
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

    func skipCodeFolders(from window: NSWindow?) {
        app.pickFolders(for: window, prompt: "Omitir") { [weak self] picked in
            guard !picked.isEmpty else { return }
            self?.codeFolders.skip(picked)
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
        .background(Brand.sheet)
    }

    private var footer: some View {
        HStack(spacing: 14) {
            StepDots(current: state.steps.firstIndex(of: state.step) ?? 0, count: state.steps.count)
            // Before Empezar there's nothing to say about the download unless it's under way or done.
            if state.step != .welcome || state.download.phase != .needed {
                DownloadStatus(download: state.download)
            }
            Spacer(minLength: 8)
            if state.step == .code {
                Text(codeSummary)
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.muted)
                    .lineLimit(1)
            }
            if state.step != .welcome, state.step != .ready {
                Button("Atrás") { state.back() }
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
        case .welcome: "Empezar"
        case .code: "Empezar a leer"
        case .shortcut: "Continuar"
        case .ready: "Hacer una pregunta"
        }
    }

    private var codeSummary: String {
        guard !state.codeFolders.roots.isEmpty else { return "Marca las carpetas de tu código" }
        guard state.codeFolders.estimatesDone else { return "Mirando tu código…" }
        let seconds = state.codeFolders.totalSeconds
        return (seconds < 1 ? "Menos de un segundo" : "Unos \(roughDuration(seconds))")
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
        .accessibilityLabel("Paso \(current + 1) de \(count)")
    }
}

/// The search model's download, small: "Descargando el modelo de búsqueda · 42 % · quedan unos 3 min", then
/// "Modelo de búsqueda listo".
struct DownloadStatus: View {
    let download: ModelDownload

    var body: some View {
        HStack(spacing: 7) {
            switch download.phase {
            case .ready:
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Brand.lit)
                Text("Modelo de búsqueda listo")
            case .failed(let message):
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Brand.negative)
                Text(message).lineLimit(1)
                Button("Reintentar") { download.start() }.controlSize(.small)
                Button("Usar archivos…") { download.chooseFiles(for: NSApp.keyWindow) }
                    .controlSize(.small)
                    .help("¿Descargaste los dos archivos del modelo en otro sitio? Elígelos aquí.")
            case .needed:
                Image(systemName: "arrow.down.circle")
                Text("Modelo de búsqueda sin descargar")
                Button("Descargar") { download.start() }.controlSize(.small)
            default:
                ProgressView(value: download.fraction)
                    .progressViewStyle(.circular)
                    .controlSize(.small)
                // Short of room (onboarding's code step), the time left goes first.
                ViewThatFits(in: .horizontal) {
                    Text("Descargando el modelo de búsqueda · \(download.progressText)")
                    Text("Modelo de búsqueda: \(download.progressText)")
                    Text("Modelo de búsqueda: \(Int(download.fraction * 100).formatted(.percent.locale(When.locale)))")
                }
                .lineLimit(1)
            }
        }
        .font(.system(size: 12))
        .foregroundStyle(Brand.muted)
    }
}

private struct WelcomeStep: View {
    var body: some View {
        VStack(spacing: 0) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 96, height: 96)
            Text("Gafitas")
                .font(.system(size: 30, weight: .bold))
                .padding(.top, 10)
            Text("Pregunta cómo funciona tu código y mira cómo encajan las piezas.")
                .font(.system(size: 15))
                .foregroundStyle(Brand.muted)
                .multilineTextAlignment(.center)
                .padding(.top, 4)
            VStack(alignment: .leading, spacing: 16) {
                row("text.magnifyingglass", "Busca en tus proyectos",
                    "Lee las carpetas de código que elijas y encuentra lo que responde, en este Mac.")
                row("point.3.connected.trianglepath.dotted", "Pi dibuja la respuesta",
                    "Explica y dibuja cómo se conectan las piezas, con las líneas reales.")
                row("clock.arrow.circlepath", "Todo queda guardado",
                    "Vuelve a cualquier pregunta sin esperar, o sigue preguntando.")
            }
            .frame(maxWidth: 440, alignment: .leading)
            .padding(.top, 30)
            Text("Gafitas descarga una vez su modelo de búsqueda (865 MB). Si el modelo de Pi no está en este Mac, "
                 + "te pregunta antes de enviar nada.")
                .font(.system(size: 11))
                .foregroundStyle(Brand.muted)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: 440, alignment: .leading)
                .padding(.top, 26)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 40)
    }

    private func row(_ symbol: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 16))
                .foregroundStyle(Brand.muted)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 13, weight: .semibold))
                Text(detail)
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
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
                .foregroundStyle(Brand.muted)
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
            StepTitle(title: "¿Qué proyectos debería leer Gafitas?",
                      subtitle: "Elige las carpetas donde guardas tu código: un repositorio o una carpeta con varios.")
            ScrollView {
                VStack(spacing: 6) {
                    FolderList(choices: state.codeFolders, addTitle: "Añadir carpetas…") {
                        state.addCodeFolders(from: NSApp.keyWindow)
                    }
                    Button("Omitir algunas carpetas") { state.skipCodeFolders(from: NSApp.keyWindow) }
                        .buttonStyle(.link)
                        .font(.system(size: 12))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                        .padding(.top, 4)
                    CodeFolderNote().padding(.top, 2)
                }
            }
            .scrollBounceBehavior(.basedOnSize)
            HStack {
                Text("Abrir el código en")
                Picker("Abrir el código en", selection: Binding(get: { CodeEditor.chosen(state.model.settings.codeEditor).id },
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
            StepTitle(title: "Pregunta desde cualquier app",
                      subtitle: "Pulsa el atajo, escribe tu pregunta y pulsa ↩.")
            ShortcutRecorder(combo: state.model.hotkey, apply: { state.app.setHotkey($0) },
                             listening: { state.app.hotkeyRecording($0) }, capSize: 20)
                .padding(.top, 34)
            Group {
                if state.hotkeyWorked {
                    Label {
                        Text("Funciona.")
                    } icon: {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(Brand.lit)
                    }
                } else if let hotkey = state.model.hotkey {
                    Text("Pruébalo ahora: pulsa \(hotkey.display).")
                        .foregroundStyle(Brand.muted)
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
    @State private var pi = AgentRunner.locate()

    var body: some View {
        VStack(spacing: 0) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 44))
                .foregroundStyle(Brand.lit)
                .padding(.top, 8)
            Text("Todo listo.")
                .font(.system(size: 26, weight: .bold))
                .padding(.top, 14)
            VStack(alignment: .leading, spacing: 16) {
                SwitchRow(title: "Abrir Gafitas al iniciar sesión", detail: "Así el atajo siempre funciona.",
                          isOn: $state.launchAtLogin)
                Divider()
                SwitchRow(title: AppSettings.batteryTitle, detail: AppSettings.batteryDetail,
                          isOn: $state.indexOnBattery)
                Divider()
                HStack(spacing: 16) {
                    Text(pi.map { "Pi, en \(tildePath($0.path))" } ?? "Pi no está instalado")
                        .font(.system(size: 13, weight: .medium))
                    Spacer(minLength: 0)
                    if pi == nil {
                        Button("Copiar comando") {
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(NeedsPi.installCommand, forType: .string)
                        }
                        .help(NeedsPi.installCommand)
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: 470, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Brand.fill))
            .padding(.top, 28)
            HStack(spacing: 8) {
                Image(systemName: "menubar.rectangle")
                Text("Gafitas vive en la barra de menús, que muestra cómo va la lectura.")
            }
            .font(.system(size: 12))
            .foregroundStyle(Brand.muted)
            .padding(.top, 22)
        }
        .frame(maxWidth: .infinity)
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
                    .foregroundStyle(Brand.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Toggle(title, isOn: $isOn).labelsHidden().toggleStyle(.switch)
        }
    }
}
