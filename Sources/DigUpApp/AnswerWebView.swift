import AppKit
import SwiftUI
import UniformTypeIdentifiers
import WebKit

/// The answer, drawn by the page in `Resources/answer-ui` (React and OpenUI, with the figure kit): a WKWebView that
/// loads it from the app's own `gafitas://` scheme (nothing from the network: the page's CSP allows only itself) and
/// the calls between it and Swift (`answer-ui/README.md`). Calls made before the page is ready wait for it.
final class AnswerBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    /// A message from the page: `open`, `hover`, `adapt`, `errors`.
    var onMessage: ([String: Any]) -> Void = { _ in }
    private(set) lazy var webView: WKWebView = makeWebView()
    private var ready = false
    private var waiting: [String] = []

    private func makeWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "gafitas")
        // An answer keeps drawing while you look at another app.
        configuration.preferences.inactiveSchedulingPolicy = .none
        configuration.userContentController.add(WeakMessageHandler(self), name: "gafitas")
        let webView = AnswerWKWebView(frame: .zero, configuration: configuration)
        webView.onAppearanceChange = { [weak self] in self?.theme() }
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")   // the sheet shows through: no white flash in dark mode
        webView.isInspectable = UserDefaults.standard.string(forKey: "defaultsSuite") != nil
        webView.load(URLRequest(url: URL(string: "gafitas://app/index.html")!))
        return webView
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        if body["type"] as? String != "hover" { log("answer page: \(body["type"] as? String ?? "?")") }
        if body["type"] as? String == "ready" {
            ready = true
            theme()
            for script in waiting { webView.evaluateJavaScript(script) }
            waiting = []
            return
        }
        onMessage(body)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        log("answer page didn't load: \(error)")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        log("answer page failed: \(error)")
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        log("answer page: its process ended")
    }

    // MARK: Swift → page

    func refs(_ refs: [[String: Any]]) { call("refs", refs) }
    func reset() { call("reset") }
    func append(_ text: String) { call("append", text) }
    func done() { call("done") }
    func replace(_ text: String) { call("replace", text) }
    func select(_ ref: String?) { call("select", ref ?? NSNull()) }

    /// The window's colors and fonts as CSS variables, so the page looks like the rest of it, light or dark.
    func theme() {
        let appearance = webView.effectiveAppearance
        var vars: [String: Any] = [:]
        appearance.performAsCurrentDrawingAppearance {
            let dark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            vars = [
                "theme": dark ? "dark" : "light",
                "--g-ground": Self.hex(.windowBackgroundColor), "--g-sheet": Self.hex(.textBackgroundColor),
                "--g-text": Self.hex(.labelColor), "--g-muted": Self.hex(.secondaryLabelColor),
                "--g-faint": Self.hex(.tertiaryLabelColor), "--g-fill": Self.hex(.quaternaryLabelColor),
                "--g-accent": Self.hex(.controlAccentColor),
                "--g-amber": dark ? "#F2A22A" : "#D97B1A", "--g-moss": "#356652",
                "--g-p1": dark ? "#A2C78E" : "#4F8058", "--g-p2": dark ? "#6FA3E0" : "#2F6FB0",
                "--g-p3": dark ? "#E07AA6" : "#B8336A", "--g-p4": Self.hex(.secondaryLabelColor),
                "--g-font": "-apple-system, BlinkMacSystemFont, sans-serif",
                "--g-mono": "ui-monospace, SFMono-Regular, monospace",
            ]
        }
        call("theme", vars)
    }

    private func call(_ function: String, _ argument: Any? = nil) {
        var arguments = ""
        if let argument {
            // A string or a list, as a JSON literal (fragments allowed, for a plain string).
            guard let data = try? JSONSerialization.data(withJSONObject: argument, options: [.fragmentsAllowed])
            else { return }
            arguments = String(decoding: data, as: UTF8.self)
        }
        let script = "window.gafitas && window.gafitas.\(function)(\(arguments))"
        if ready { webView.evaluateJavaScript(script) } else { waiting.append(script) }
    }

    private static func hex(_ color: NSColor) -> String {
        guard let rgb = color.usingColorSpace(.sRGB) else { return "#808080" }
        let alpha = rgb.alphaComponent < 1 ? String(format: "%02X", Int(rgb.alphaComponent * 255)) : ""
        return String(format: "#%02X%02X%02X", Int(rgb.redComponent * 255), Int(rgb.greenComponent * 255),
                      Int(rgb.blueComponent * 255)) + alpha
    }
}

/// The page follows the window's appearance as it changes.
private final class AnswerWKWebView: WKWebView {
    var onAppearanceChange: () -> Void = {}

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        onAppearanceChange()
    }
}

/// WKUserContentController keeps its handlers: through this the bridge can still go away with its window.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

/// `gafitas://app/<path>`: the files of `Resources/answer-ui`, and nothing outside it.
private final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root = Bundle.main.resourceURL!.appendingPathComponent("answer-ui").standardizedFileURL

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        let path = task.request.url?.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? ""
        let file = root.appendingPathComponent(path.isEmpty ? "index.html" : path).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let type = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        task.didReceive(URLResponse(url: task.request.url!, mimeType: type, expectedContentLength: data.count,
                                    textEncodingName: type.hasPrefix("text/") || type.hasSuffix("javascript") ? "utf-8" : nil))
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}

/// The bridge's web view in SwiftUI.
struct AnswerWebView: NSViewRepresentable {
    let bridge: AnswerBridge

    func makeNSView(context: Context) -> WKWebView { bridge.webView }
    func updateNSView(_ view: WKWebView, context: Context) {}
}
