import AppKit
import SwiftUI

/// The home screen: the question, centred, with the projects it searches and what to try.
struct HomeView: View {
    @Bindable var ask: AskModel
    let model: AppModel
    let app: AppController
    @State private var focused = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 24).frame(maxHeight: 168)
            VStack(alignment: .leading, spacing: 14) {
                field
                Text(underLine)
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.muted)
                    .padding(.horizontal, 4)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.updatesFrequently)
                if !ask.projects.isEmpty || model.hasCode {
                    chips.padding(.horizontal, 4)
                }
                if ask.answer == .needsPi {
                    NeedsPi(retry: ask.askNow).padding(.top, 20)
                } else if !model.hasCode {
                    noProjects.padding(.top, 20)
                } else {
                    examples.padding(.top, 22)
                }
            }
            .frame(maxWidth: 772)
            Spacer()
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity)
    }

    private var field: some View {
        HStack(spacing: 12) {
            Image(systemName: "sunglasses.fill")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Brand.lit)
                .accessibilityHidden(true)
            SearchField(text: $ask.question, fontSize: 17, placeholder: "Pregunta cómo funciona algo en tu código",
                        onMake: { ask.field = $0 }, onFocus: { focused = $0 })
            if !ask.question.isEmpty {
                Button { ask.question = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Brand.muted)
                }
                .buttonStyle(.plain)
                .help("Borrar la pregunta")
                .accessibilityLabel("Borrar la pregunta")
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 56)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Brand.fill))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
            .strokeBorder(Color.accentColor.opacity(focused ? 0.7 : 0), lineWidth: 2))
        .animation(.easeOut(duration: 0.15), value: focused)
    }

    private var underLine: String {
        var line: String
        if ask.trimmed.isEmpty {
            line = "Gafitas busca en tus proyectos el código que responde y Pi dibuja cómo encajan las piezas."
        } else if !model.hasCode {
            line = "↩ para preguntar. Sin proyectos, la respuesta sale solo de lo que sabe el modelo."
        } else if !ask.dug {
            line = "Buscando en tus proyectos…"
        } else if ask.places.isEmpty {
            line = "Nada cercano en tus proyectos. Si te refieres a tu código, nombra una función o un archivo."
        } else {
            line = "\(ask.placesLine) · ↩ para preguntar"
        }
        if let indexing = model.status.code.indexing, indexing.total > 0 {
            let percent = Int((Double(indexing.done) / Double(indexing.total) * 100).rounded(.down))
            line += "\nTodavía leyendo tu código (\(percent) %): parte aún no está."
        }
        return line
    }

    private var chips: some View {
        HStack(spacing: 6) {
            Text("Busca en").font(.system(size: 12)).foregroundStyle(Brand.muted)
            ForEach(ask.projects) { project in
                ProjectChip(project: project, on: !ask.leftOut.contains(project.path)) { ask.toggle(project) }
            }
            Button("Añadir proyecto…") { app.chooseCodeFolders() }
                .buttonStyle(.plain)
                .font(.system(size: 12))
                .foregroundStyle(Brand.muted)
                .padding(.horizontal, 6)
        }
        .frame(height: 24)
    }

    private var examples: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Prueba con")
                .font(.system(size: 12))
                .foregroundStyle(Brand.muted)
                .padding(.horizontal, 4)
                .padding(.bottom, 4)
            ForEach(exampleQuestions, id: \.self) { example in
                Button {
                    ask.question = example
                    ask.focusField()
                } label: {
                    Text(example)
                        .font(.system(size: 14))
                        .padding(.horizontal, 4)
                        .frame(height: 32, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// Two projects: how they connect, first. With none, a question about anything.
    private var exampleQuestions: [String] {
        let largest = ask.projects.sorted { $0.files > $1.files }.prefix(2).map(\.name)
        var list: [String] = []
        if largest.count == 2 { list.append("¿Cómo se conecta \(largest[0]) con \(largest[1])?") }
        list += ["¿Cómo se reintentan los errores de red?", "¿Dónde se añadiría una herramienta nueva?"]
        return Array(list.prefix(3))
    }

    private var noProjects: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Todavía no hay proyectos.").font(.system(size: 15, weight: .semibold))
            Text("Añade una carpeta con código y Gafitas la lee en este Mac. Puedes preguntar igual: la respuesta saldrá solo de lo que sabe el modelo.")
                .font(.system(size: 13))
                .foregroundStyle(Brand.muted)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Button("Añadir carpeta de proyecto…") { app.chooseCodeFolders() }
                    .controlSize(.large)
                    .keyboardShortcut(.defaultAction)
                Button("¿Cómo crece una tabla hash?") { ask.question = "¿Cómo crece una tabla hash?" }
                    .buttonStyle(.plain)
                    .font(.system(size: 13))
            }
            .padding(.top, 4)
        }
        .padding(.horizontal, 4)
    }
}

/// A project's chip: its tint, its name and how many files; off leaves it out of the search.
struct ProjectChip: View {
    let project: Project
    let on: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 6) {
                Circle().fill(on ? Brand.projectTint(project.index) : Brand.muted.opacity(0.4)).frame(width: 7, height: 7)
                Text(project.name).font(.system(size: 12, weight: .medium))
                Text(project.files.formatted(.number.locale(When.locale)))
                    .font(.system(size: 11).monospacedDigit())
                    .foregroundStyle(Brand.muted)
            }
            .padding(.horizontal, 9)
            .frame(height: 24)
            .background(Capsule().fill(on ? Brand.fill : Color.clear))
            .overlay(Capsule().strokeBorder(Brand.edge, lineWidth: on ? 0 : 1))
            .opacity(on ? 1 : 0.7)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .help(on ? "Clic para dejar fuera \(project.name) · \(files)" : "Clic para buscar también en \(project.name)")
        .accessibilityLabel("\(project.name), \(files), \(on ? "incluido" : "fuera")")
    }

    private var files: String {
        project.files == 1 ? "1 archivo de código" : "\(project.files.formatted(.number.locale(When.locale))) archivos de código"
    }
}

/// The follow-up field, docked under the thread: Detener while Pi works.
struct Composer: View {
    @Bindable var ask: AskModel

    var body: some View {
        VStack(spacing: 10) {
            if ask.answer == .needsPi { NeedsPi(retry: ask.sendFollowUp) }
            HStack(spacing: 10) {
                SearchField(text: $ask.followUp, fontSize: 15, placeholder: "Sigue preguntando sobre esto",
                            onMake: { ask.followUpField = $0 })
                    .frame(height: 22)
                if let agent = ask.agentModel {
                    Text(agent.name + (agent.local ? " · en este Mac" : ""))
                        .font(.system(size: 11))
                        .foregroundStyle(Brand.muted)
                        .lineLimit(1)
                        .help("Pi responde con este modelo. Se cambia en Pi.")
                }
                if ask.working {
                    Button("Detener", action: ask.stop)
                        .help("Detener la respuesta (⌘.)")
                } else {
                    Button("Preguntar", action: ask.sendFollowUp)
                        .disabled(ask.followUp.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .padding(.leading, 14)
            .padding(.trailing, 8)
            .frame(height: 44)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Brand.sheet))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Brand.edge, lineWidth: 1))
        }
        .frame(maxWidth: 772)
        .padding(.horizontal, 24)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity)
    }
}

/// Pi isn't on this Mac: how to install it, and try again.
struct NeedsPi: View {
    let retry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Pi no está instalado").font(.system(size: 15, weight: .semibold))
            Text("Gafitas escribe las respuestas con Pi, un agente de código. Instálalo en Terminal y comprueba de nuevo; tu pregunta te espera.")
                .font(.system(size: 13))
                .foregroundStyle(Brand.muted)
                .fixedSize(horizontal: false, vertical: true)
            Text(Self.installCommand)
                .font(.system(size: 12, design: .monospaced))
                .textSelection(.enabled)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Brand.fill))
            HStack {
                Button("Copiar comando") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(Self.installCommand, forType: .string)
                }
                .help("Cópialo para pegarlo en Terminal")
                Button("Comprobar de nuevo", action: retry).keyboardShortcut(.defaultAction)
            }
            .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    static let installCommand = "npm install -g @earendil-works/pi-coding-agent"
}

/// The provider a question would go to, for the privacy sheet.
struct Provider: Identifiable {
    let name: String
    var id: String { name }
}

/// Before the first question goes to a model off this Mac: what's sent, to whom, and what isn't.
struct PrivacySheet: View {
    let ask: AskModel
    let provider: String
    @State private var always = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("¿Enviar esta pregunta a \(Self.title(provider))?")
                .font(.system(size: 15, weight: .semibold))
            Text("Para escribir la respuesta, Gafitas envía a \(Self.title(provider)), a través de Pi, tu pregunta, \(what) "
                 + "y lo que Pi lea de esos proyectos mientras responde. Nada más sale de este Mac: ni otras carpetas ni el índice.")
                .font(.system(size: 13))
                .fixedSize(horizontal: false, vertical: true)
            Toggle("No volver a preguntar para \(Self.title(provider))", isOn: $always)
                .font(.system(size: 12))
            HStack {
                Spacer()
                Button("Cancelar", action: ask.cancelConfirm).keyboardShortcut(.cancelAction)
                Button("Enviar a \(Self.title(provider))") { ask.approve(provider, always: always) }
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 460)
    }

    /// "los 15 lugares que encontró (412 líneas de requests y urllib3)".
    private var what: String {
        let sending = ask.sending
        guard sending.places > 0 else { return "sin lugares de tus proyectos," }
        let places = sending.places == 1 ? "el lugar que encontró" : "los \(sending.places) lugares que encontró"
        let repos = sending.repos.isEmpty ? "" : " de \(AskModel.list(sending.repos))"
        return "\(places) (\(sending.lines.formatted(.number.locale(When.locale))) líneas\(repos))"
    }

    /// "opencode-go" → "Opencode Go", "anthropic" → "Anthropic".
    static func title(_ provider: String) -> String {
        provider.split(whereSeparator: { $0 == "-" || $0 == "_" }).map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }
}
