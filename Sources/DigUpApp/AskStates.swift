import AppKit
import SwiftUI

/// The sheet the answer is drawn on, and what it says before there's one.
struct AnswerSheet: View {
    @Bindable var ask: AskModel
    let model: AppModel
    let app: AppController

    var body: some View {
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
