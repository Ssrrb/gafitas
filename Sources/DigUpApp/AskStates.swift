import AppKit
import SwiftUI

/// The sheet the answer is drawn on, and what it says before there's one.
struct AnswerSheet: View {
    @Bindable var ask: AskModel
    let model: AppModel
    let app: AppController

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                if ask.answer == .working { ProgressView().controlSize(.small) }
                if ask.answer != .idle {
                    Text(ask.progress)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                if ask.answer == .working {
                    Button("Stop", action: ask.stop).controlSize(.small).help("Stop the answer (⌘.)")
                }
            }
            .padding(.horizontal, 16)
            .frame(height: 40)
            switch ask.answer {
            case .idle: before
            case .needsPi: needsPi
            case .working, .done, .failed: drawn
            }
        }
    }

    /// The answer as it's drawn, and a follow-up under it.
    private var drawn: some View {
        VStack(spacing: 0) {
            if case .failed(let problem) = ask.answer {
                Text("The answer stopped partway: \(problem). What it drew so far stays.")
                    .font(.system(size: 12))
                    .foregroundStyle(.orange)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 6)
            }
            AnswerWebView(bridge: ask.bridge)
            Divider()
            HStack(spacing: 8) {
                SearchField(text: $ask.followUp, fontSize: 13,
                            placeholder: "Ask a follow-up: “what if a skill needs keys?”",
                            onMake: { ask.followUpField = $0 })
                    .frame(height: 20)
                Button("Ask", action: ask.sendFollowUp)
                    .controlSize(.small)
                    .disabled(ask.followUp.trimmingCharacters(in: .whitespaces).isEmpty || ask.answer == .working)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
        }
    }

    private var needsPi: some View {
        SheetMessage(title: "Pi isn't installed",
                     message: "Gafitas writes answers with the Pi coding agent. Install it in Terminal, then check "
                         + "again. The places it found are on the left.") {
            VStack(spacing: 10) {
                Text(Self.installCommand)
                    .font(.system(size: 12, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.primary.opacity(0.06)))
                HStack {
                    Button("Copy Command") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(Self.installCommand, forType: .string)
                    }
                    Button("Check Again", action: ask.askNow).keyboardShortcut(.defaultAction)
                }
            }
        }
    }

    static let installCommand = "npm install -g @earendil-works/pi-coding-agent"

    @ViewBuilder private var before: some View {
        if !model.hasCode && ask.trimmed.isEmpty {
            SheetMessage(title: "No projects yet",
                         message: "Add a folder with code and Gafitas reads it on this Mac. You can still ask; the "
                             + "answer then comes from the model alone.") {
                Button("Add Project Folder…") { app.chooseCodeFolders() }
                    .controlSize(.large)
                    .keyboardShortcut(.defaultAction)
            }
        } else if ask.trimmed.isEmpty {
            SheetMessage(title: "Ask how something works",
                         message: "Gafitas finds the code in your projects that answers it, then draws how it fits "
                             + "together. Questions about anything else work too.") {
                HStack(spacing: 6) {
                    ForEach(Self.examples, id: \.self) { example in
                        Button {
                            ask.question = example
                        } label: {
                            Text(example)
                                .font(.system(size: 12))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Capsule().fill(Color.primary.opacity(0.06)))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        } else {
            SheetMessage(title: "Press Return for the answer",
                         message: "The places on the left are found on this Mac. The answer is drawn from them.") {
                EmptyView()
            }
        }
    }

    static let examples = ["Where would a new tool plug in?", "How are errors retried?", "How does a hash map grow?"]
}

/// A title, a line under it, and what to do: centered on the sheet, as DigUp's empty states are.
struct SheetMessage<Actions: View>: View {
    let title: String
    let message: String
    @ViewBuilder let actions: () -> Actions

    var body: some View {
        VStack(spacing: 10) {
            Text(title)
                .font(.system(size: 17, weight: .semibold))
                .multilineTextAlignment(.center)
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)
                .fixedSize(horizontal: false, vertical: true)
            actions().padding(.top, 6)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
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
            Text("Send this question to \(Self.title(provider))?")
                .font(.system(size: 15, weight: .semibold))
            Text("To write the answer, Gafitas sends your question and the \(placesLine) it found to \(Self.title(provider)) "
                 + "through Pi. Nothing else leaves this Mac: not your other files, not the index.")
                .font(.system(size: 13))
                .fixedSize(horizontal: false, vertical: true)
            Toggle("Don't ask again for \(Self.title(provider))", isOn: $always)
                .font(.system(size: 12))
            HStack {
                Spacer()
                Button("Cancel", action: ask.cancelConfirm).keyboardShortcut(.cancelAction)
                Button("Send to \(Self.title(provider))") { ask.approve(provider, always: always) }
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 440)
    }

    private var placesLine: String {
        let count = ask.places.count
        return count == 1 ? "1 place" : "\(count) places"
    }

    /// "opencode-go" → "Opencode Go", "anthropic" → "Anthropic".
    static func title(_ provider: String) -> String {
        provider.split(whereSeparator: { $0 == "-" || $0 == "_" }).map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }
}
