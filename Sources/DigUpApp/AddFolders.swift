import AppKit
import DigUpKit
import SwiftUI

/// Settings → Code → Add Folders…: a sheet like onboarding's code step. It lists the folders with code that aren't
/// searched yet and any other folder you choose, each opening to its repos, with how long reading them takes and how
/// much room their index needs; nothing changes until Add. With nothing left to suggest, it starts from the open panel.
final class AddFoldersController {
    private unowned let app: AppController
    private(set) var choices: FolderChoices?
    private var sheet: NSWindow?
    /// The folders changed (Settings refreshes its list).
    var onAdded: () -> Void = {}

    init(app: AppController) {
        self.app = app
    }

    var isOpen: Bool { choices != nil }

    func begin(on window: NSWindow?) {
        guard choices == nil else { return }
        let settings = app.model.settings
        let selection = FolderSelection(skipped: settings.codeExcluded.map(\.path), kept: settings.codeRoots.map(\.path))
        let suggestions = CodeFolders.candidates().filter { !selection.isSearched($0.path) }
        let choices = FolderChoices(rows: suggestions, selection: selection, types: [], code: true)
        self.choices = choices
        // Snapshot runs never put an open panel on screen (-debugChoices picks folders instead).
        guard suggestions.isEmpty, !AppController.offscreen else { return present(choices, on: window) }
        app.pickFolders(for: window) { [weak self] picked in
            guard let self else { return }
            guard !picked.isEmpty else {
                self.choices = nil
                return
            }
            choices.add(picked)
            present(choices, on: window)
        }
    }

    private func present(_ choices: FolderChoices, on window: NSWindow?) {
        let view = AddFoldersView(choices: choices,
                                  pick: { [weak self] in self?.pick() },
                                  cancel: { [weak self] in self?.end() },
                                  add: { [weak self] in self?.add() })
        let sheet = NSWindow(contentViewController: NSHostingController(rootView: view))
        sheet.styleMask = [.titled]
        sheet.title = "Proyectos"
        self.sheet = sheet
        choices.startEstimates()
        log("add folders: \(choices.rows.count) to choose from")
        guard !AppController.offscreen else { return }   // snapshot runs draw it without showing it
        if let window, window.isVisible { window.beginSheet(sheet) } else { app.present(sheet) }
    }

    private func pick() {
        app.pickFolders(for: sheet) { [weak self] picked in
            guard !picked.isEmpty else { return }
            self?.choices?.add(picked)
        }
    }

    func add() {
        guard let choices else { return }
        log("add code folders: \(choices.roots.map { tildePath($0.path) })"
            + (choices.skipped.isEmpty ? "" : " minus \(choices.skipped.map { tildePath($0.path) })"))
        app.applyCodeFolders(choices.roots, excluded: choices.skipped)
        end()
        onAdded()
    }

    func end() {
        if let sheet {
            if let parent = sheet.sheetParent { parent.endSheet(sheet) } else { sheet.close() }
        }
        sheet = nil
        choices = nil
    }

    func snapshot(to url: URL) throws {
        try Snapshot.write(sheet, to: url)
    }
}

private struct AddFoldersView: View {
    let choices: FolderChoices
    let pick: () -> Void
    let cancel: () -> Void
    let add: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                StepTitle(title: "Añadir proyectos",
                          subtitle: "Elige las carpetas donde guardas tu código: un repositorio o una carpeta con "
                              + "varios. Gafitas lee tu código una vez y luego solo lo que cambie.")
                ScrollView {
                    FolderList(choices: choices, addTitle: "Elegir otra carpeta…", add: pick)
                    CodeFolderNote().padding(.top, 8)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
            .padding(.horizontal, 28)
            .padding(.top, 24)
            .padding(.bottom, 12)
            Divider()
            HStack(spacing: 12) {
                Text(summary)
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.muted)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Button("Cancelar", action: cancel)
                    .keyboardShortcut(.cancelAction)
                Button("Añadir", action: add)
                    .keyboardShortcut(.defaultAction)
                    .disabled(!choices.changesSomething)
            }
            .controlSize(.large)
            .padding(.horizontal, 20)
            .frame(height: 60)
        }
        .frame(width: 600, height: 540)
    }

    private var summary: String {
        guard choices.changesSomething else { return "Marca las carpetas que quieras añadir" }
        guard choices.estimatesDone else { return "Mirando las carpetas…" }
        let time = choices.totalSeconds < 1 ? "menos de un segundo" : "unos \(roughDuration(choices.totalSeconds))"
        return "Añade \(time) de lectura y \(roughBytes(choices.totalBytes))"
    }
}

/// What code search leaves out, under a list of code folders.
struct CodeFolderNote: View {
    var body: some View {
        Label {
            Text("Lo que git ignora, el código de terceros y el generado se omiten siempre; las claves nunca se leen.")
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "info.circle")
        }
        .font(.system(size: 11))
        .foregroundStyle(Brand.muted)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
    }
}
