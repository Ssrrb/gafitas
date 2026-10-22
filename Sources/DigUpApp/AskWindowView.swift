import AppKit
import DigUpKit
import SwiftUI

/// The framed sheet: the history in the tinted frame on the left, a top bar with the chat's title, and the chat on an
/// opaque sheet inset from the window's edges (no shadow, no glass): the home screen, or the thread with its composer.
struct AskWindowView: View {
    @Bindable var ask: AskModel
    let model: AppModel
    let app: AppController

    var body: some View {
        HStack(spacing: 0) {
            if ask.sidebarShown {
                HistorySidebar(ask: ask, model: model, app: app)
                    .frame(width: 248)
            }
            VStack(spacing: 0) {
                TopBar(ask: ask)
                sheet
                    .padding(.leading, ask.sidebarShown ? 0 : 8)
                    .padding([.trailing, .bottom], 8)
            }
        }
        .background(Brand.ground)
        .ignoresSafeArea(.container, edges: .top)
        .frame(minWidth: 980, minHeight: 620)
        .animation(.easeOut(duration: 0.15), value: ask.sidebarShown)
        .sheet(item: Binding(get: { ask.confirming.map(Provider.init) }, set: { if $0 == nil { ask.confirming = nil } })) {
            PrivacySheet(ask: ask, provider: $0.name)
        }
    }

    private var sheet: some View {
        Group {
            if ask.chat == nil {
                HomeView(ask: ask, model: model, app: app)
            } else {
                VStack(spacing: 0) {
                    AnswerWebView(bridge: ask.bridge)
                    Composer(ask: ask)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.sheet)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Brand.edge, lineWidth: 1))
    }
}

/// The two buttons beside the window's own: the history, and a new question.
private struct FrameButtons: View {
    @Bindable var ask: AskModel

    var body: some View {
        HStack(spacing: 2) {
            FrameButton(symbol: "sidebar.left", help: ask.sidebarShown ? "Ocultar el historial (⌃⌘S)" : "Mostrar el historial (⌃⌘S)") {
                ask.sidebarShown.toggle()
            }
            FrameButton(symbol: "square.and.pencil", help: "Nueva pregunta (⌘N)", action: ask.newQuestion)
                .disabled(ask.working)
        }
    }
}

private struct FrameButton: View {
    let symbol: String
    let help: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14))
                .foregroundStyle(Brand.muted)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
        .accessibilityLabel(help)
    }
}

/// The chat's title: its first question, its projects and when it was asked.
private struct TopBar: View {
    @Bindable var ask: AskModel

    var body: some View {
        HStack(spacing: 12) {
            if !ask.sidebarShown {
                FrameButtons(ask: ask).padding(.leading, 78)   // beside the window buttons
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(ask.chat?.title ?? "Nueva pregunta")
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                    .truncationMode(.tail)
                if let chat = ask.chat {
                    HStack(spacing: 5) {
                        ForEach(chat.projects.prefix(3), id: \.self) { repo in
                            Circle().fill(ask.tint(ofRepo: repo)).frame(width: 6, height: 6)
                            Text(repo)
                        }
                        Text("· \(When.long(chat.created))")
                    }
                    .font(.system(size: 11))
                    .foregroundStyle(Brand.muted)
                    .lineLimit(1)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .frame(height: 52)
    }
}

/// Every chat, newest first, grouped by when: Hoy, Ayer, Últimos 7 días, Últimos 30 días, then months.
private struct HistorySidebar: View {
    @Bindable var ask: AskModel
    let model: AppModel
    let app: AppController

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Spacer()
                FrameButtons(ask: ask)
            }
            .padding(.trailing, 10)
            .frame(height: 52)
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").font(.system(size: 11)).foregroundStyle(Brand.muted)
                SearchField(text: $ask.historyQuery, fontSize: 12, placeholder: "Buscar en el historial",
                            onMake: { ask.historyField = $0 })
            }
            .padding(.horizontal, 8)
            .frame(height: 28)
            .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Brand.fill))
            .padding(.horizontal, 10)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(groups, id: \.title) { group in
                        Text(group.title)
                            .font(.system(size: 12))
                            .foregroundStyle(Brand.muted)
                            .padding(.horizontal, 10)
                            .padding(.top, group.title == groups.first?.title ? 12 : 22)
                            .padding(.bottom, 4)
                            .accessibilityAddTraits(.isHeader)
                        ForEach(group.rows) { row in
                            HistoryRow(ask: ask, row: row)
                        }
                    }
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 12)
            }
            .overlay {
                if rows.isEmpty {
                    Text(ask.historyQuery.isEmpty
                         ? "Tus preguntas se guardan aquí. Vuelve a cualquiera para ver su respuesta o seguir preguntando."
                         : "Nada en el historial coincide con «\(ask.historyQuery)».")
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.muted)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .padding(18)
                }
            }
            Button(model.codeStatusLine) { app.showSettings(.code) }
                .buttonStyle(.plain)
                .font(.system(size: 11))
                .foregroundStyle(Brand.muted)
                .lineLimit(2)
                .help("Tus proyectos y cómo va la lectura")
                .padding(.horizontal, 18)
                .frame(height: 40, alignment: .leading)
        }
    }

    /// The chat being answered shows before it's saved.
    private var rows: [ChatSummary] {
        var rows = ask.shownHistory
        if let chat = ask.chat, !rows.contains(where: { $0.id == chat.id }), ask.historyQuery.isEmpty {
            rows.insert(ChatSummary(id: chat.id, title: chat.title.isEmpty ? ask.asking : chat.title,
                                    created: chat.created, updated: chat.created, projects: chat.projects,
                                    questions: max(1, chat.turns.count), failed: false), at: 0)
        }
        return rows
    }

    private var groups: [(title: String, rows: [ChatSummary])] {
        var order: [String] = []
        var byTitle: [String: [ChatSummary]] = [:]
        for row in rows {
            let title = When.group(row.updated)
            if byTitle[title] == nil { order.append(title) }
            byTitle[title, default: []].append(row)
        }
        return order.map { ($0, byTitle[$0]!) }
    }
}

private struct HistoryRow: View {
    @Bindable var ask: AskModel
    let row: ChatSummary

    private var selected: Bool { ask.chat?.id == row.id }
    private var live: Bool { selected && ask.working }

    var body: some View {
        Button { ask.open(chat: row.id) } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(row.title)
                    .font(.system(size: 13))
                    .lineSpacing(1)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .foregroundStyle(.primary)
                HStack(spacing: 5) {
                    if live { Circle().fill(Brand.lit).frame(width: 6, height: 6) }
                    ForEach(row.projects.prefix(3), id: \.self) { repo in
                        Circle().fill(ask.tint(ofRepo: repo)).frame(width: 6, height: 6)
                    }
                    Text(meta).lineLimit(1)
                }
                .font(.system(size: 11))
                .foregroundStyle(Brand.muted)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(selected ? Brand.active : .clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(ask.working && !selected)
        .help(ask.working && !selected ? "Pi está respondiendo; detén la respuesta para cambiar de conversación." : "")
        .contextMenu {
            Button("Eliminar…") { ask.confirmDelete(row.id) }.disabled(live)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
    }

    private var meta: String {
        if live { return "Respondiendo…" }
        var parts = [When.short(row.updated)]
        if row.questions > 1 { parts.append("\(row.questions) preguntas") }
        if row.failed { parts.append("Se cortó") }
        return parts.joined(separator: " · ")
    }
}

/// Dates the way the window says them, in Spanish.
enum When {
    static let locale = Locale(identifier: "es")

    /// "14:32" today and yesterday, else "lun 19 oct".
    static func short(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) || calendar.isDateInYesterday(date) {
            return date.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(locale))
        }
        return date.formatted(Date.FormatStyle().weekday(.abbreviated).day().month(.abbreviated).locale(locale))
            .replacingOccurrences(of: ".", with: "")
    }

    /// "hoy, 14:32", "ayer, 9:05", "lun 19 oct, 14:32".
    static func long(_ date: Date) -> String {
        let calendar = Calendar.current
        let time = date.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(locale))
        if calendar.isDateInToday(date) { return "hoy, \(time)" }
        if calendar.isDateInYesterday(date) { return "ayer, \(time)" }
        return "\(short(date)), \(time)"
    }

    static func group(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Hoy" }
        if calendar.isDateInYesterday(date) { return "Ayer" }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date),
                                           to: calendar.startOfDay(for: Date())).day ?? 0
        if days < 7 { return "Últimos 7 días" }
        if days < 30 { return "Últimos 30 días" }
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: Date())
        let style = sameYear ? Date.FormatStyle().month(.wide) : Date.FormatStyle().month(.wide).year()
        return date.formatted(style.locale(locale))
    }
}
