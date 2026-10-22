import AppKit
import SwiftUI

/// The menubar icon: the app icon's sunglasses (`Resources/AppIcon/gafitas.png`) as a template, so it takes the bar's
/// color. Ready, the lenses are solid, each with a glint cut out; while the model downloads or code is read, the frame
/// is drawn and the lenses fill from the left as far as it has come; paused, they're hollow with a bar in each, so the
/// pair reads as a pause sign. The left half is drawn and mirrored (the glints aren't: both slant the same way).
enum StatusIcon {
    /// The left lens's outline (the right one is its mirror image), stroked 1.5 pt with a 2 pt brow.
    private static let lens = NSRect(x: 1.45, y: 5.2, width: 6.7, height: 5)
    /// The lens's outer top corner rises this much above the brow: the wayfarer's wing.
    private static let wing: CGFloat = 0.7
    private static let mirror: AffineTransform = {
        var transform = AffineTransform(translationByX: 18, byY: 0)
        transform.scale(x: -1, y: 1)
        return transform
    }()

    static func image(progress: Double?, paused: Bool = false) -> NSImage {
        let image = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { _ in
            NSColor.black.set()
            let rim = outline()
            rim.lineWidth = 1.5
            rim.lineJoinStyle = .round
            let temple = NSBezierPath()
            temple.move(to: NSPoint(x: lens.minX + 0.1, y: lens.maxY + wing - 0.3))
            temple.line(to: NSPoint(x: 0.8, y: 12.6))
            temple.lineWidth = 1.5
            temple.lineCapStyle = .round
            // The brow, from the wing to the middle, where it meets the other half: the bridge.
            let brow = NSBezierPath()
            brow.move(to: NSPoint(x: lens.minX + 0.3, y: lens.maxY + wing - 0.1))
            brow.line(to: NSPoint(x: lens.maxX - 0.4, y: lens.maxY - 0.1))
            brow.line(to: NSPoint(x: 9, y: lens.maxY - 0.35))
            brow.lineWidth = 2
            brow.lineJoinStyle = .round
            for path in [rim, temple, brow] {
                path.stroke()
                let other = path.copy() as! NSBezierPath
                other.transform(using: mirror)
                other.stroke()
            }
            if paused {
                for x in [lens.midX, 18 - lens.midX] {
                    NSRect(x: x - 0.75, y: lens.minY + 0.7, width: 1.5, height: lens.height - 1.6).fill()
                }
                return true
            }
            let glass = NSBezierPath()
            glass.windingRule = .evenOdd   // the glints are holes
            let right = outline()
            right.transform(using: mirror)
            glass.append(outline())
            glass.append(right)
            glass.append(glint(at: lens.minX + 1.5))
            glass.append(glint(at: 18 - lens.maxX + 1.5))
            NSGraphicsContext.saveGraphicsState()
            if let progress {   // from the left lens's outer edge to the right one's
                NSRect(x: 0, y: 0, width: lens.minX + (18 - 2 * lens.minX) * min(1, max(0, progress)), height: 18).clip()
            }
            glass.fill()
            NSGraphicsContext.restoreGraphicsState()
            return true
        }
        image.isTemplate = true
        image.accessibilityDescription = "Gafitas"
        return image
    }

    /// The left lens: a straight brow rising to the wing, the nose side cut away at the bottom.
    private static func outline() -> NSBezierPath {
        let r = lens, path = NSBezierPath()
        path.move(to: NSPoint(x: r.minX, y: r.maxY + wing))
        path.line(to: NSPoint(x: r.maxX - 0.6, y: r.maxY))
        path.curve(to: NSPoint(x: r.maxX, y: r.maxY - 0.6), controlPoint1: NSPoint(x: r.maxX - 0.25, y: r.maxY),
                   controlPoint2: NSPoint(x: r.maxX, y: r.maxY - 0.25))
        path.line(to: NSPoint(x: r.maxX, y: r.minY + 2.6))
        path.curve(to: NSPoint(x: r.maxX - 2.6, y: r.minY), controlPoint1: NSPoint(x: r.maxX - 0.2, y: r.minY + 1),
                   controlPoint2: NSPoint(x: r.maxX - 1.2, y: r.minY))
        path.line(to: NSPoint(x: r.minX + 1.8, y: r.minY))
        path.curve(to: NSPoint(x: r.minX + 0.3, y: r.minY + 1.6), controlPoint1: NSPoint(x: r.minX + 0.8, y: r.minY),
                   controlPoint2: NSPoint(x: r.minX + 0.35, y: r.minY + 0.7))
        path.close()
        return path
    }

    /// A glint: a short stripe slanting up to the right, its foot at `x`.
    private static func glint(at x: CGFloat) -> NSBezierPath {
        let path = NSBezierPath(), y = lens.minY + 1.1
        path.move(to: NSPoint(x: x, y: y))
        path.line(to: NSPoint(x: x + 1, y: y))
        path.line(to: NSPoint(x: x + 2.9, y: y + 2.6))
        path.line(to: NSPoint(x: x + 1.9, y: y + 2.6))
        path.close()
        return path
    }
}

/// The menubar icon and its menu: what's going on (with a progress bar), a new question, the recent chats, Pause,
/// Settings, Quit.
final class StatusMenuController: NSObject, NSMenuDelegate {
    private let model: AppModel
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let menu = NSMenu()
    var onAsk: () -> Void = {}
    var onOpenChat: (String) -> Void = { _ in }
    var onSettings: () -> Void = {}
    var onPauseChanged: (Bool) -> Void = { _ in }
    private var shownProgress: Double?
    private var shownPaused = false

    init(model: AppModel) {
        self.model = model
        super.init()
        menu.delegate = self
        statusItem.menu = menu
        refreshButton()
        observeModel()
    }

    private func observeModel() {
        withObservationTracking {
            _ = model.status
            _ = model.progress
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.refreshButton()
                self?.observeModel()
            }
        }
    }

    private func refreshButton() {
        guard let button = statusItem.button else { return }
        let progress = model.progress.map { ($0 * 50).rounded() / 50 }   // redraw in 2% steps, not every file
        let paused = model.status.paused
        if progress != shownProgress || paused != shownPaused || button.image == nil {
            button.image = StatusIcon.image(progress: progress, paused: paused)
            shownProgress = progress
            shownPaused = paused
        }
        button.toolTip = "Gafitas: \(model.statusLine)"
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let header = NSMenuItem()
        let view = NSHostingView(rootView: MenuStatusView(model: model))
        view.frame.size = view.fittingSize
        header.view = view
        menu.addItem(header)
        menu.addItem(.separator())

        let ask = ActionMenuItem("Nueva pregunta…") { [weak self] in self?.onAsk() }
        if let hotkey = model.hotkey, let (key, modifiers) = hotkey.menuEquivalent {
            ask.keyEquivalent = key
            ask.keyEquivalentModifierMask = modifiers
        }
        menu.addItem(ask)
        menu.addItem(recentItem())
        if model.hasCode {
            menu.addItem(.separator())
            let paused = model.status.paused
            menu.addItem(ActionMenuItem(paused ? "Reanudar la lectura" : "Pausar la lectura") { [weak self] in
                self?.onPauseChanged(!paused)
            })
        }
        switch model.download.phase {
        case .failed, .needed:
            menu.addItem(ActionMenuItem("Descargar el modelo de búsqueda") { [weak self] in self?.model.download.start() })
        default:
            break
        }
        menu.addItem(.separator())
        menu.addItem(ActionMenuItem("Ajustes…", key: ",") { [weak self] in self?.onSettings() })
        menu.addItem(ActionMenuItem("Salir de Gafitas", key: "q") { NSApp.terminate(nil) })
    }

    /// Recientes: the last 8 chats, newest first, each reopening in the Ask window; then the whole history.
    private func recentItem() -> NSMenuItem {
        let item = NSMenuItem(title: "Recientes", action: nil, keyEquivalent: "")
        let submenu = NSMenu()
        let chats = ChatLog(index: model.settings.indexDirectory).list().prefix(8)
        if chats.isEmpty {
            let none = NSMenuItem(title: "Todavía no hay conversaciones", action: nil, keyEquivalent: "")
            none.isEnabled = false
            submenu.addItem(none)
        }
        for chat in chats {
            let title = chat.title.replacingOccurrences(of: "\n", with: " ")
            submenu.addItem(ActionMenuItem(title.count > 48 ? title.prefix(47).trimmingCharacters(in: .whitespaces) + "…"
                                           : title) { [weak self] in self?.onOpenChat(chat.id) })
        }
        if !chats.isEmpty {
            submenu.addItem(.separator())
            submenu.addItem(ActionMenuItem("Mostrar el historial") { [weak self] in self?.onAsk() })
        }
        item.submenu = submenu
        return item
    }

    /// The menu as text, for the -debugMenu launch argument (menus can't be clicked from a script).
    func describeMenu() -> String {
        let menu = NSMenu()
        menuNeedsUpdate(menu)
        func describe(_ items: [NSMenuItem]) -> String {
            items.map { item in
                if item.isSeparatorItem { return "—" }
                if item.view != nil { return "[\(model.statusLine)]" }
                return item.title + (item.isEnabled ? "" : " (disabled)")
                    + (item.submenu.map { " ▸ {" + describe($0.items) + "}" } ?? "")
            }.joined(separator: " | ")
        }
        return describe(menu.items)
    }

    /// Runs a menu item by title, for -debugMenu.
    func performItem(titled title: String) {
        let menu = NSMenu()
        menuNeedsUpdate(menu)
        guard let item = menu.items.first(where: { $0.title == title }), let action = item.action else { return }
        NSApp.sendAction(action, to: item.target, from: item)
    }
}

/// The top of the menu: the status line, a detail (where, or how long), and progress while there is some.
struct MenuStatusView: View {
    let model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(model.statusLine)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            if let detail {
                Text(detail)
                    .font(.system(size: 11))
                    .foregroundStyle(Brand.muted)
                    .lineLimit(2)
            }
            if let progress = model.progress {
                ProgressView(value: progress)
                    .controlSize(.small)
                    .padding(.top, 2)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 5)
        .frame(width: 290, alignment: .leading)
    }

    private var detail: String? {
        if model.download.isActive { return model.download.progressText }
        if case .failed(let message) = model.download.phase { return message }
        guard model.hasCode else { return "Añade tus proyectos en Ajustes → Código." }
        let missing = Set(model.status.code.missingRoots), unreadable = Set(model.status.code.unreadableRoots)
        let names = model.settings.codeRoots.map { root in
            root.lastPathComponent + (missing.contains(root.path) ? " (sin conectar)"
                                      : unreadable.contains(root.path) ? " (sin acceso)" : "")
        }
        return "En " + names.formatted(.list(type: .and).locale(When.locale))
    }
}

/// Makes an NSMenuItem that runs a closure.
private final class MenuAction: NSObject {
    let handler: () -> Void

    init(_ handler: @escaping () -> Void) {
        self.handler = handler
    }

    @objc func run() { handler() }
}

func ActionMenuItem(_ title: String, key: String = "", handler: @escaping () -> Void) -> NSMenuItem {
    let action = MenuAction(handler)
    let item = NSMenuItem(title: title, action: #selector(MenuAction.run), keyEquivalent: key)
    item.target = action
    item.representedObject = action  // `target` is weak; this keeps the action alive
    return item
}
