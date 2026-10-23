import AppKit
import Observation

/// State the menubar and the windows share. Engine updates arrive on the main thread.
@Observable
final class AppModel {
    var status = EngineStatus()
    var settings: AppSettings
    var hotkey: KeyCombo?
    let download: ModelDownload

    init(settings: AppSettings, download: ModelDownload) {
        self.settings = settings
        self.download = download
    }

    /// Code search is on (there are code folders).
    var hasCode: Bool { !settings.codeRoots.isEmpty }

    /// One line for the menu and the windows: what the index is doing.
    var statusLine: String {
        let status = self.status
        guard hasCode else { return "Todavía no hay proyectos" }
        switch status.activity {
        case .starting: return "Empezando…"
        case .failed(let problem): return "⚠︎ \(problem)"
        case .syncing: return "Revisando tus proyectos…"
        case .indexing(let done, let total):
            return "Leyendo: \(percent(done, of: total)) · \(number(done)) de \(number(total))"
        case .finishing(let done, let total, let files):
            let which = files > 0 ? "\(number(files)) \(files == 1 ? "archivo largo" : "archivos largos")" : "archivos largos"
            return "Leyendo el resto de \(which) · \(percent(done, of: total))"
        case .idle:
            if let line = downloadLine { return line }
            if settings.roots.isEmpty { return codeStatusLine }   // only code folders: what the main index says is 0
            if let code = status.code.indexing, code.total > 0 {
                return "Leyendo tu código: \(percent(code.done, of: code.total)) · \(number(code.done)) de \(number(code.total))"
            }
            let waiting = "\(files(status.pending)) \(status.pending == 1 ? "espera" : "esperan")"
            if status.pending > 0, status.paused { return "En pausa · \(waiting)" }
            if let until = status.heldUntil, !status.paused {
                // Outside the set hours: what's known to wait, and when reading starts again.
                let when = "se lee desde las \(time(until))"
                if status.pending > 0 { return "\(waiting) · \(when)" }
                return "\(files(status.searchable)) \(status.searchable == 1 ? "leído" : "leídos") · \(when)"
            }
            if status.pending > 0, let reason = status.waitingFor { return "\(waiting) · \(reason)" }
            if status.pending > 0 { return "\(waiting) a que se lean" }
            if status.unfinished > 0 {
                let rest = "\(number(status.unfinished)) \(status.unfinished == 1 ? "archivo largo" : "archivos largos") por terminar"
                if status.paused { return "En pausa · \(rest)" }
                if let reason = status.waitingFor { return "\(rest) · \(reason)" }
            }
            return "\(files(status.searchable)) \(status.searchable == 1 ? "leído" : "leídos")"
                + (status.paused ? " · en pausa" : "")
        }
    }

    /// While the search model isn't there, how its download goes.
    private var downloadLine: String? {
        switch download.phase {
        case .ready: nil
        case .downloading: "Descargando el modelo de búsqueda: \(Int(download.fraction * 100).formatted(.percent.locale(When.locale)))"
        case .verifying: "Comprobando la descarga del modelo…"
        case .retrying: "Descarga del modelo: esperando a la red"
        case .failed: "⚠︎ La descarga del modelo se detuvo"
        case .needed: status.pending > 0 ? "Falta descargar el modelo de búsqueda" : nil
        }
    }

    /// 0…1 for the menubar icon and progress bars: the model download, then an indexing pass or the rest of long files.
    var progress: Double? {
        if download.isActive { return download.fraction }
        switch status.activity {
        case .indexing(let done, let total) where total > 0: return Double(done) / Double(total)
        case .finishing(let done, let total, _) where total > 0: return Double(done) / Double(total)
        case .idle:
            guard let code = status.code.indexing, code.total > 0 else { return nil }
            return Double(code.done) / Double(code.total)
        default: return nil
        }
    }

    /// One line about the code index, for the menu, Settings → Código and the foot of the Ask window's history:
    /// "207 archivos de código leídos", "Leyendo tu código: 62 % · 1234 de 2000".
    var codeStatusLine: String {
        let code = status.code
        guard hasCode else { return "La búsqueda en el código está desactivada" }
        if !download.isReady { return "Esperando al modelo de búsqueda" }
        if let indexing = code.indexing, indexing.total > 0 {
            return "Leyendo tu código: \(percent(indexing.done, of: indexing.total)) · "
                + "\(number(indexing.done)) de \(number(indexing.total))"
        }
        let waiting = "\(codeFiles(code.pending)) \(code.pending == 1 ? "espera" : "esperan")"
        if code.pending > 0, status.paused { return "En pausa · \(waiting)" }
        if code.pending > 0, let reason = status.waitingFor { return "\(waiting) · \(reason)" }
        if code.pending > 0, let until = status.heldUntil { return "\(waiting) · se lee desde las \(time(until))" }
        // Code is read once the other folders have nothing waiting (the helper's order).
        if code.pending > 0, status.pending > 0 { return "\(waiting) · se lee después de tus otros archivos" }
        return "\(codeFiles(code.searchable)) \(code.searchable == 1 ? "leído" : "leídos")"
            + (code.pending > 0 ? " · \(number(code.pending)) por leer" : "")
    }

    private func number(_ count: Int) -> String { count.formatted(.number.locale(When.locale)) }
    private func files(_ count: Int) -> String { "\(number(count)) \(count == 1 ? "archivo" : "archivos")" }
    private func codeFiles(_ count: Int) -> String { "\(number(count)) \(count == 1 ? "archivo" : "archivos") de código" }
    private func time(_ date: Date) -> String { date.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(When.locale)) }

    /// "62 %", rounded down: 100 % only once it's all done.
    private func percent(_ done: Int, of total: Int) -> String {
        let percent = total > 0 ? Int((Double(done) / Double(total) * 100).rounded(.down)) : 0
        return percent.formatted(.percent.locale(When.locale))
    }
}
