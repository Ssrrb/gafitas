import Foundation

/// Pi, the coding agent, writing the answer: started in its RPC mode (JSON lines on stdin and stdout, split on "\n"
/// only, as Pi's docs ask) with Gafitas's extension (`Resources/pi/gafitas.ts`: the `dig` tool and the folder guard),
/// only the read-only tools, and the figure library's instructions. It stays up between questions; its events arrive
/// on the main thread.
final class AgentRunner {
    enum Event {
        /// The model Pi answers with; `local` when it runs on this Mac (nothing is sent anywhere then).
        case model(name: String, provider: String, local: Bool)
        case progress(String)
        /// A piece of the answer's program, from its `root =` on (what a model says before that is narration).
        case program(String)
        /// Places Pi's `dig` found, as the extension describes them (`d1`…).
        case refs([[String: Any]])
        case finished
        case failed(String)
    }

    var onEvent: (Event) -> Void = { _ in }
    private var process: Process?
    private var input: FileHandle?
    private var buffer = Data()
    private var stopping = false
    /// The current assistant message's text, and how much of it went out as program.
    private var message = ""
    private var sent = 0
    private(set) var busy = false
    /// A conversation has started: the next question needs a fresh one first.
    private var talked = false
    /// The question waiting for `new_session` to finish (sent at once, it would be wiped by it).
    private var afterReset: String?
    /// The reply is corrected statements, not a whole program: all of it counts, not only from `root =`.
    private var raw = false

    /// Pi's command: where your login shell finds it (a GUI app gets a bare PATH), else where its installers put it.
    static func locate() -> URL? {
        let path = environment["PATH"] ?? ""
        let candidates = path.split(separator: ":").map { "\($0)/pi" }
            + ["\(NSHomeDirectory())/.local/bin/pi", "/opt/homebrew/bin/pi", "/usr/local/bin/pi"]
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }.map(URL.init(fileURLWithPath:))
    }

    /// The environment Pi runs in: the app's, with your login shell's PATH, since Pi's launcher needs `node` from it
    /// (nvm, fnm…). Asked once, with a time limit.
    static let environment: [String: String] = {
        var environment = ProcessInfo.processInfo.environment
        let shell = Process()
        shell.executableURL = URL(fileURLWithPath: environment["SHELL"] ?? "/bin/zsh")
        shell.arguments = ["-lic", "printf '\\n__GAFITAS_PATH__%s\\n' \"$PATH\""]
        let output = Pipe()
        shell.standardOutput = output
        shell.standardError = FileHandle.nullDevice
        shell.standardInput = FileHandle.nullDevice
        do {
            try shell.run()
            let deadline = Date().addingTimeInterval(3)
            while shell.isRunning, Date() < deadline { Thread.sleep(forTimeInterval: 0.02) }
            if shell.isRunning { shell.terminate() }
            let text = String(decoding: output.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
            if let line = text.split(separator: "\n").last(where: { $0.hasPrefix("__GAFITAS_PATH__") }) {
                environment["PATH"] = String(line.dropFirst("__GAFITAS_PATH__".count))
            }
        } catch {
            log("agent: can't ask \(shell.executableURL!.path) for its PATH: \(error)")
        }
        return environment
    }()

    var isRunning: Bool { process?.isRunning == true }

    /// Starts Pi in the first code folder (its tools' default place), reading only inside `roots`.
    func start(pi: URL, roots: [URL], index: URL, models: URL) throws {
        guard !isRunning else { return }
        let resources = Bundle.main.resourceURL!
        let process = Process()
        process.executableURL = pi
        process.arguments = ["--mode", "rpc", "--no-session", "-ne", "-e", resources.appendingPathComponent("pi/gafitas.ts").path,
                             "-ns", "-np", "-nc", "--tools", "dig,read,grep,find,ls",
                             "--append-system-prompt", resources.appendingPathComponent("pi/answer.md").path,
                             "--append-system-prompt", resources.appendingPathComponent("answer-ui/system-prompt.txt").path]
        process.currentDirectoryURL = roots.first ?? FileManager.default.temporaryDirectory
        process.environment = Self.environment.merging([
            "GAFITAS_DIGUP": Bundle.main.bundleURL.appendingPathComponent("Contents/Helpers/digup").path,
            "GAFITAS_INDEX": index.path,
            "GAFITAS_ROOTS": roots.map(\.path).joined(separator: ":"),
            "DIGUP_MODELS": models.path,
        ]) { $1 }
        let input = Pipe(), output = Pipe()
        process.standardInput = input
        process.standardOutput = output
        process.standardError = Engine.appendingHandle(index.appendingPathComponent("agent.log"))
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil }
            DispatchQueue.main.async { self?.received(data) }
        }
        process.terminationHandler = { [weak self] process in
            DispatchQueue.main.async { self?.exited(status: process.terminationStatus) }
        }
        stopping = false
        try process.run()
        self.process = process
        self.input = input.fileHandleForWriting
        log("agent: pi started (pid \(process.processIdentifier))")
        send(["type": "get_state"])
    }

    func stop() {
        stopping = true
        talked = false
        afterReset = nil
        process?.terminate()
        process = nil
        input = nil
    }

    /// A question, after a fresh conversation (follow-ups keep it: `followUp`).
    func ask(_ message: String) {
        guard talked else { return prompt(message) }
        afterReset = message
        busy = true
        send(["type": "new_session"])
    }

    func followUp(_ message: String) {
        prompt(message)
    }

    /// Asks for corrected statements only; they come back as `.program` pieces, whole.
    func correct(_ message: String) {
        prompt(message, raw: true)
    }

    /// Something to take into account mid-answer ("set aside r4"); between answers it waits for the next prompt.
    func steer(_ message: String) {
        if busy { send(["type": "steer", "message": message]) }
    }

    func abort() {
        send(["type": "abort"])
    }

    private func prompt(_ message: String, raw: Bool = false) {
        self.raw = raw
        var command: [String: Any] = ["type": "prompt", "message": message]
        if busy, afterReset == nil { command["streamingBehavior"] = "followUp" }
        busy = true
        talked = true
        self.message = ""
        sent = 0
        send(command)
    }

    private func send(_ command: [String: Any]) {
        guard let input, let data = try? JSONSerialization.data(withJSONObject: command) else { return }
        try? input.write(contentsOf: data + Data([0x0A]))
    }

    private func received(_ data: Data) {
        buffer.append(data)
        while let newline = buffer.firstIndex(of: 0x0A) {
            let line = buffer[buffer.startIndex..<newline]
            buffer.removeSubrange(buffer.startIndex...newline)
            guard let event = (try? JSONSerialization.jsonObject(with: line)) as? [String: Any] else { continue }
            handle(event)
        }
    }

    private func handle(_ event: [String: Any]) {
        switch event["type"] as? String {
        case "response":
            if event["command"] as? String == "new_session", let message = afterReset {
                afterReset = nil
                busy = false
                prompt(message)
            } else if event["success"] as? Bool == false {
                busy = false
                onEvent(.failed(event["error"] as? String ?? "Pi didn't take the request"))
            } else if event["command"] as? String == "get_state",
                      let model = (event["data"] as? [String: Any])?["model"] as? [String: Any] {
                let host = (model["baseUrl"] as? String).flatMap { URL(string: $0)?.host } ?? ""
                let provider = model["provider"] as? String ?? ""
                let local = ["localhost", "127.0.0.1", "::1"].contains(host) || ["ollama", "lmstudio"].contains(provider)
                onEvent(.model(name: model["name"] as? String ?? model["id"] as? String ?? "the model",
                               provider: provider, local: local))
            }
        case "message_start":
            if ((event["message"] as? [String: Any])?["role"] as? String) == "assistant" {
                message = ""
                sent = 0
            }
        case "message_update":
            guard let update = event["assistantMessageEvent"] as? [String: Any],
                  update["type"] as? String == "text_delta", let delta = update["delta"] as? String else { return }
            message += delta
            emitProgram()
        case "tool_execution_start":
            let name = event["toolName"] as? String ?? ""
            let args = event["args"] as? [String: Any] ?? [:]
            switch name {
            case "dig": onEvent(.progress("Digging up “\(args["query"] as? String ?? "")”…"))
            case "read": onEvent(.progress("Reading \(((args["path"] as? String ?? "") as NSString).lastPathComponent)…"))
            default: onEvent(.progress("Looking through the code…"))
            }
        case "tool_execution_end":
            if event["toolName"] as? String == "dig",
               let refs = ((event["result"] as? [String: Any])?["details"] as? [String: Any])?["refs"] as? [[String: Any]] {
                onEvent(.refs(refs))
            }
        case "agent_settled":
            busy = false
            onEvent(.finished)
        default:
            break
        }
    }

    /// The program starts at its `root =` line (corrected statements, at their first); a code fence around it is
    /// dropped.
    private func emitProgram() {
        // A statement starts a line: "root =" inside a model's thinking aloud ("Final: root first line.root = …")
        // isn't the program yet.
        let first = raw ? message.firstRange(of: /(?m)^[A-Za-z_][A-Za-z0-9_]* *=/)
                        : message.firstRange(of: /(?m)^root *=/)
        guard let first else { return }
        var program = String(message[first.lowerBound...])
        if let fence = program.range(of: "\n```") { program = String(program[..<fence.lowerBound]) }
        guard program.count > sent else { return }
        onEvent(.program(String(program.dropFirst(sent))))
        sent = program.count
    }

    private func exited(status: Int32) {
        process = nil
        input = nil
        let wasBusy = busy
        busy = false
        log("agent: pi exited (\(status))")
        if !stopping, wasBusy { onEvent(.failed("Pi stopped partway (exit \(status))")) }
    }
}
