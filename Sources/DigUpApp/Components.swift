import AppKit
import DigUpKit
import SwiftUI

/// The app's own colors, from its icon (green sunglasses on a blue wash, `Resources/AppIcon/gafitas.png`): lime is
/// "lit", the one colour of attention (the step being explained, the live dot); the frame takes the wash's blue at
/// very low chroma; projects are cobalt, rose and amber. Controls and focus follow the system accent like any Mac app.
/// The answer page gets the same values (`AnswerBridge.theme()`), so window and page are one surface.
enum Brand {
    typealias Pair = (light: UInt32, dark: UInt32)

    static let groundHex: Pair = (0xF3F5F8, 0x17181B)
    static let sheetHex: Pair = (0xFFFFFF, 0x1F2023)
    static let edgeHex: Pair = (0xE3E5EA, 0x2E2F34)
    static let textHex: Pair = (0x1D1D1F, 0xECECEC)
    static let mutedHex: Pair = (0x5F6368, 0xA8A8AE)
    static let fillHex: Pair = (0xEEF0F4, 0x2A2B2F)
    static let activeHex: Pair = (0xE4E6EB, 0x2C2D32)
    static let litHex: Pair = (0x3F9612, 0x86E04A)
    static let litInkHex: Pair = (0x2E7D0B, 0x86E04A)
    static let litFillHex: Pair = (0xE0FED2, 0x334527)
    static let negativeHex: Pair = (0xC4242A, 0xE5566F)
    /// Projects: cobalt (the icon's blue), rose, amber, at least 60° of hue apart. A fourth and on are muted.
    static let tintHex: [Pair] = [(0x2552C9, 0x7EA2F5), (0xB8336A, 0xE77AA8), (0x9A6212, 0xE0A23E)]

    static let ground = color(groundHex)
    static let sheet = color(sheetHex)
    static let edge = color(edgeHex)
    /// Secondary words: 6:1 on the sheet (the system's secondary label is 3.95:1 on white).
    static let muted = color(mutedHex)
    static let fill = color(fillHex)
    static let active = color(activeHex)
    static let lit = color(litHex)
    static let litInk = color(litInkHex)
    static let litFill = color(litFillHex)
    static let negative = color(negativeHex)

    /// A code folder's tint (its chip, its dots, its pieces).
    static func projectTint(_ index: Int) -> Color {
        tintHex[safe: index].map(color) ?? muted
    }

    static func color(_ pair: Pair) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let hex = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? pair.dark : pair.light
            return NSColor(srgbRed: CGFloat(hex >> 16 & 0xFF) / 255, green: CGFloat(hex >> 8 & 0xFF) / 255,
                           blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
        })
    }

    static func hex(_ pair: Pair, dark: Bool) -> String { String(format: "#%06X", dark ? pair.dark : pair.light) }
}

/// ⇧ ⌘ Space as keycaps.
struct Keycaps: View {
    let caps: [String]
    var size: CGFloat = 12

    var body: some View {
        HStack(spacing: size * 0.3) {
            ForEach(Array(caps.enumerated()), id: \.offset) { _, cap in
                Text(cap)
                    .font(.system(size: size, weight: .medium, design: .rounded))
                    .frame(minWidth: size * 1.6)
                    .padding(.horizontal, size * 0.45)
                    .padding(.vertical, size * 0.28)
                    .background(RoundedRectangle(cornerRadius: size * 0.42, style: .continuous)
                        .fill(Color.primary.opacity(0.07)))
                    .overlay(RoundedRectangle(cornerRadius: size * 0.42, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.14), lineWidth: 0.5))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(caps.joined(separator: " "))
    }
}

/// What a folder holds, compactly, with the full wording in the tooltip.
struct KindCounts: View {
    let counts: [FileKind: Int]

    var body: some View {
        HStack(spacing: 10) {
            ForEach(FileKind.allCases.filter { (counts[$0] ?? 0) > 0 }, id: \.self) { kind in
                Label(counts[kind]!.formatted(), systemImage: kind.symbol)
                    .labelStyle(CompactLabel())
                    .lineLimit(1)
                    .fixedSize()
            }
        }
        .font(.system(size: 11).monospacedDigit())
        .foregroundStyle(Brand.muted)
        .help(description)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(description)
    }

    /// "136 capturas, 104 imágenes, 25 PDF"
    var description: String {
        FileKind.allCases.compactMap { kind in
            counts[kind].flatMap { $0 > 0 ? kind.counted($0) : nil }
        }.joined(separator: ", ")
    }
}

private struct CompactLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 3) {
            configuration.icon.font(.system(size: 10))
            configuration.title
        }
    }
}

extension FileKind {
    /// "1 captura", "25 PDF", "6 audios"
    func counted(_ count: Int) -> String {
        let one = count == 1
        let noun = switch self {
        case .screenshot: one ? "captura" : "capturas"
        case .image: one ? "imagen" : "imágenes"
        case .pdf: "PDF"
        case .doc: one ? "documento" : "documentos"
        case .audio: one ? "audio" : "audios"
        case .video: one ? "vídeo" : "vídeos"
        case .code: one ? "archivo de código" : "archivos de código"
        }
        return "\(count.formatted(.number.locale(Locale(identifier: "es")))) \(noun)"
    }
}

/// System Settings → Privacy & Security → Files and Folders, where a folder denied in macOS's prompt can be allowed.
func openFolderPrivacySettings() {
    if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders") {
        NSWorkspace.shared.open(url)
    }
}

/// The Ask window's question and follow-up fields. AppKit, so the window can focus them directly; the arrows, ↩ and
/// Esc never reach them, because its key monitor takes those first.
struct SearchField: NSViewRepresentable {
    /// The pause in typing after which the question is dug up again.
    static let typingPause: Duration = .milliseconds(120)
    @Binding var text: String
    var fontSize: CGFloat = 22
    let placeholder: String
    var onMake: (NSTextField) -> Void = { _ in }
    /// The field got the cursor (true) or lost it (false).
    var onFocus: (Bool) -> Void = { _ in }

    func makeNSView(context: Context) -> NSTextField {
        let field = FocusReportingField()
        field.onFocus = onFocus
        field.isBordered = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.font = .systemFont(ofSize: fontSize)
        field.placeholderString = placeholder
        field.usesSingleLineMode = true
        field.cell?.isScrollable = true
        field.cell?.wraps = false
        field.delegate = context.coordinator
        field.setAccessibilityLabel("Pregunta")
        onMake(field)
        return field
    }

    func updateNSView(_ field: NSTextField, context: Context) {
        context.coordinator.text = $text
        (field as? FocusReportingField)?.onFocus = onFocus
        // While an input method composes (Korean, Japanese, Chinese), the field is ahead of `text` until the syllable
        // is committed, and writing `text` back would cut the composition short ("사어ㅂ" typed for "사업").
        if (field.currentEditor() as? NSTextView)?.hasMarkedText() != true, field.stringValue != text {
            field.stringValue = text
        }
        if field.placeholderString != placeholder { field.placeholderString = placeholder }
    }

    func makeCoordinator() -> Coordinator { Coordinator(text: $text) }

    final class Coordinator: NSObject, NSTextFieldDelegate {
        var text: Binding<String>

        init(text: Binding<String>) {
            self.text = text
        }

        func controlTextDidChange(_ notification: Notification) {
            guard let field = notification.object as? NSTextField else { return }
            text.wrappedValue = field.stringValue
        }
    }
}

/// A text field that says when it gets the cursor and when it gives it up (its editing ends).
final class FocusReportingField: NSTextField {
    var onFocus: (Bool) -> Void = { _ in }

    override func becomeFirstResponder() -> Bool {
        let became = super.becomeFirstResponder()
        if became { onFocus(true) }
        return became
    }

    override func textDidEndEditing(_ notification: Notification) {
        super.textDidEndEditing(notification)
        onFocus(false)
    }
}

/// Click, then press the new shortcut; Esc cancels. While it listens, the global hotkey steps aside (`listening`) so
/// that pressing the current one lands here instead of opening the Ask window.
struct ShortcutRecorder: View {
    let combo: KeyCombo?
    /// Tries a combination: nil when it's set, else why it can't be used.
    let apply: (KeyCombo) -> String?
    let listening: (Bool) -> Void
    var capSize: CGFloat = 15
    @State private var recording = false
    @State private var problem: String?

    var body: some View {
        VStack(spacing: 6) {
            Button { setRecording(!recording) } label: {
                Group {
                    if recording {
                        Text("Pulsa el atajo nuevo…").foregroundStyle(Brand.muted)
                    } else if let combo {
                        Keycaps(caps: combo.caps, size: capSize)
                    } else {
                        Text("Haz clic para elegir un atajo").foregroundStyle(Brand.muted)
                    }
                }
                .font(.system(size: 13))
                .frame(minWidth: 190, minHeight: capSize * 2.4)
                .padding(.horizontal, 12)
                .contentShape(Rectangle())
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(Color.primary.opacity(recording ? 0.03 : 0.05)))
                .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .strokeBorder(recording ? Color.accentColor : Color.primary.opacity(0.15),
                                  lineWidth: recording ? 2 : 1))
            }
            .buttonStyle(.plain)
            .background(KeyCatcher(active: recording, onKey: handle, onResign: { setRecording(false) }))
            .accessibilityLabel(recording ? "Grabando un atajo nuevo" : "Atajo \(combo?.display ?? "ninguno"), haz clic para cambiarlo")
            Text(problem ?? (recording ? "Esc cancela" : "Haz clic para cambiarlo"))
                .font(.system(size: 11))
                .foregroundStyle(problem == nil ? AnyShapeStyle(.tertiary) : AnyShapeStyle(Color.red))
                .multilineTextAlignment(.center)
        }
        .onDisappear { if recording { listening(false) } }
    }

    private func setRecording(_ on: Bool) {
        guard on != recording else { return }
        recording = on
        if !on { problem = nil }
        listening(on)
    }

    private func handle(_ event: NSEvent) {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask).subtracting([.capsLock, .function,
                                                                                               .numericPad])
        if event.keyCode == 53, flags.isEmpty { return setRecording(false) }   // Esc
        guard let combo = KeyCombo(keyCode: event.keyCode, flags: flags) else {
            problem = "Usa ⌘, ⌥ o ⌃ con una tecla"
            return
        }
        if let why = apply(combo) {
            problem = why
        } else {
            setRecording(false)
        }
    }
}

/// Takes key presses (⌘-combinations too, before any menu sees them) while `active`. `onResign`: the window or the
/// view lost the keyboard, so listening must stop (the global hotkey is off meanwhile).
private struct KeyCatcher: NSViewRepresentable {
    let active: Bool
    let onKey: (NSEvent) -> Void
    let onResign: () -> Void

    func makeNSView(context: Context) -> KeyCatcherView { KeyCatcherView() }

    func updateNSView(_ view: KeyCatcherView, context: Context) {
        view.onKey = onKey
        view.onResign = onResign
        guard view.active != active else { return }
        view.active = active
        DispatchQueue.main.async {
            if active {
                view.window?.makeFirstResponder(view)
            } else if view.window?.firstResponder === view {
                view.window?.makeFirstResponder(nil)
            }
        }
    }
}

private final class KeyCatcherView: NSView {
    var active = false
    var onKey: (NSEvent) -> Void = { _ in }
    var onResign: () -> Void = {}
    private var resignObserver: NSObjectProtocol?

    override var acceptsFirstResponder: Bool { active }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if let resignObserver { NotificationCenter.default.removeObserver(resignObserver) }
        resignObserver = nil
        guard let window else { return }
        resignObserver = NotificationCenter.default.addObserver(forName: NSWindow.didResignKeyNotification,
                                                                object: window, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.active else { return }
                self.onResign()
            }
        }
    }

    override func resignFirstResponder() -> Bool {
        if active { DispatchQueue.main.async { [weak self] in self?.onResign() } }
        return super.resignFirstResponder()
    }

    override func keyDown(with event: NSEvent) {
        if active { onKey(event) } else { super.keyDown(with: event) }
    }

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        guard active, window?.firstResponder === self else { return super.performKeyEquivalent(with: event) }
        onKey(event)
        return true
    }
}
