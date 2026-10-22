import AppKit
import DigUpKit

extension ResultRow {
    /// The line a code result opens at: where the name is defined or the query's words are, else where its stretch
    /// starts (a notebook's at its top: editors can't be told a cell).
    var codeLine: Int {
        segment == .lines ? max(1, Int(focus ?? loc ?? 1)) : 1
    }
}

extension Engine {
    /// Opens a place in the editor chosen for code, at its line.
    func open(_ row: ResultRow) {
        CodeEditor.current.open(row.url, line: row.codeLine)
    }
}

enum Opener {
    /// Debug runs: say how a place would open, and don't.
    static var dryRun = false
}
