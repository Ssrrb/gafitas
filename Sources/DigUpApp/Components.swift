import AppKit
import DigUpKit
import SwiftUI

/// The app's own colors, from its icon (moss tiles around an amber D, `Resources/AppIcon`): amber marks what DigUp
/// finds (accent icons), moss is for brand moments (onboarding's glow and tiles); selection and controls follow the
/// system accent color like any Mac app.
enum Brand {
    static let amber = Color(red: 0.949, green: 0.635, blue: 0.165)    // #F2A22A, the D
    static let ember = Color(red: 0.851, green: 0.482, blue: 0.102)    // #D97B1A, a deeper amber that holds up on white
    static let moss = Color(red: 0.208, green: 0.400, blue: 0.322)     // #356652, the darkest tile
    static let leaf = Color(red: 0.310, green: 0.502, blue: 0.345)     // #4F8058
    static let sprout = Color(red: 0.635, green: 0.780, blue: 0.557)   // #A2C78E, a light tile
    /// Accent icons: the D's amber.
    static let gradient = LinearGradient(colors: [amber, ember], startPoint: .top, endPoint: .bottom)
    /// Tiles with a white symbol on them, like the icon's.
    static let tile = LinearGradient(colors: [leaf, moss], startPoint: .top, endPoint: .bottom)
    /// The soft glow behind onboarding's steps.
    static let wash = LinearGradient(colors: [sprout, leaf], startPoint: .topLeading, endPoint: .bottomTrailing)

    /// A code folder's tint in the Ask window (its chip and its places): leaf, cobalt, rose, at least
    /// 60° of hue apart, a lighter one in dark mode. A fourth folder and on are gray.
    static func projectTint(_ index: Int) -> Color {
        let tints: [(light: UInt32, dark: UInt32)] = [(0x4F8058, 0xA2C78E), (0x2F6FB0, 0x6FA3E0), (0xB8336A, 0xE07AA6)]
        guard let tint = tints[safe: index] else { return Color.secondary }
        return Color(nsColor: NSColor(name: nil) { appearance in
            let hex = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? tint.dark : tint.light
            return NSColor(srgbRed: CGFloat(hex >> 16 & 0xFF) / 255, green: CGFloat(hex >> 8 & 0xFF) / 255,
                           blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
        })
    }
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

/// "L12–40" on a place: the lines that matched.
struct PlaceBadge: View {
    let text: String
    var onImage = false

    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold).monospacedDigit())
            .foregroundStyle(onImage ? AnyShapeStyle(.white) : AnyShapeStyle(.primary))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(onImage ? AnyShapeStyle(.black.opacity(0.6)) : AnyShapeStyle(.quaternary)))
    }
}

/// What a folder holds, compactly: 📷 136  🖼 104  📄 25 … (the full wording in the tooltip).
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
        .foregroundStyle(.secondary)
        .help(description)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(description)
    }

    /// "136 screenshots, 104 images, 25 PDFs"
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
    /// "1 screenshot", "25 PDFs", "6 audio files"
    func counted(_ count: Int) -> String {
        let one = count == 1
        let noun = switch self {
        case .screenshot: one ? "screenshot" : "screenshots"
        case .image: one ? "image" : "images"
        case .pdf: one ? "PDF" : "PDFs"
        case .doc: one ? "document" : "documents"
        case .audio: one ? "audio file" : "audio files"
        case .video: one ? "video" : "videos"
        case .code: one ? "code file" : "code files"
        }
        return "\(count.formatted()) \(noun)"
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
        field.setAccessibilityLabel("Search")
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
                        Text("Press the new shortcut…").foregroundStyle(.secondary)
                    } else if let combo {
                        Keycaps(caps: combo.caps, size: capSize)
                    } else {
                        Text("Click to set a shortcut").foregroundStyle(.secondary)
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
            .accessibilityLabel(recording ? "Recording a new shortcut" : "Shortcut \(combo?.display ?? "none"), click to change")
            Text(problem ?? (recording ? "Esc cancels" : "Click to change"))
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
            problem = "Use ⌘, ⌥ or ⌃ with a key"
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
