import SwiftUI

struct LegacyAdoptionScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model: LegacyAdoptionModel
    @State private var draft: RecurringDraft?
    @State private var categoryName: String?
    @State private var notice: String?
    @State private var confirmation: LegacyAdoptionReview?
    @State private var cancellation = false
    @FocusState private var focused: String?
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss

    init(session: SessionModel, member: VerifiedMember, ruleId: UUID?) {
        self.session = session
        self.member = member
        _model = StateObject(wrappedValue: LegacyAdoptionModel(session: session, member: member, ruleId: ruleId))
    }

    var body: some View {
        Form {
            if let saved = model.saved {
                LegacyAdoptionTerms(context: saved.reviewed, member: member)
                LegacyAdoptionNewTerms(input: saved.command.input, members: model.members, member: member)
                recovery(saved)
            } else if let original = model.currentRule {
                LegacyAdoptionTerms(context: original, member: member)
                if let adopted = original.adoption {
                    Section {
                        NavigationLink("View current rule") {
                            RecurringRuleScreen(session: session, member: member, ruleId: adopted.nativeRuleId)
                                .id(session.generation)
                        }
                    }
                } else if original.canAdopt {
                    editor
                }
            } else if model.loaded {
                Text("No saved rule adoption.")
            }
            if let notice = notice ?? model.notice { Section { Text(notice) } }
            Section { Button("Reload rule and people") { Task { await reload() } } }
        }
        .disabled(model.working)
        .navigationTitle("Move rule to Nest")
        .modifier(MoneyDraftKeyboard(focus: $focused))
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if model.working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task(id: session.generation) { await reload() }
        .onChange(of: phase) { _, phase in
            confirmation = nil
            cancellation = false
            if phase == .active { Task { await reload() } } else { model.suspendReview() }
        }
        .alert(
            "Adopt new terms?",
            isPresented: Binding(
                get: { confirmation != nil }, set: { if !$0 { confirmation = nil } })
        ) {
            if let expected = confirmation { Button("Adopt") { Task { await model.confirm(expected) } } }
            Button("Cancel", role: .cancel) { confirmation = nil }
        } message: {
            Text(
                confirmation?.input.configuration.mode == .fixed
                    ? "Fixed expenses record automatically." : "Each bill needs confirmation.")
        }
        .alert("Cancel request?", isPresented: $cancellation) {
            Button("Cancel request", role: .destructive) { Task { await model.retry(cancel: true) } }
            Button("Keep", role: .cancel) { cancellation = false }
        } message: {
            Text("Recorded results win.")
        }
    }

    @ViewBuilder private var editor: some View {
        if let review = model.review {
            LegacyAdoptionNewTerms(
                input: review.input, members: model.members, member: member, categoryName: categoryName)
            Section {
                Button("Adopt reviewed terms") {
                    focused = nil
                    confirmation = review
                }
                Button("Edit new terms") { model.edit() }
            }
        } else if let draft {
            Section("Choose new terms") {
                Text("Choose the new schedule and recording mode. No original amount or split is filled in for you.")
            }
            RecurringEditorFields(
                draft: Binding(get: { self.draft ?? draft }, set: { self.draft = $0 }),
                members: model.members, focus: $focused, usesNativeDate: true)
            Section {
                NavigationLink(categoryName ?? "Choose category (optional)") {
                    ExpenseCategoryPicker(
                        session: session, member: member,
                        selection: Binding(get: { self.draft?.categoryId }, set: { self.draft?.categoryId = $0 }),
                        selectedName: $categoryName)
                }
                Button("Review new terms") { prepare() }
            }
        }
    }

    private func reload() async {
        confirmation = nil
        notice = nil
        await model.load()
        if let today = model.today, model.saved == nil {
            draft = RecurringDraft(member: member, today: today).retainingEdits(from: draft)
        }
    }

    private func prepare() {
        focused = nil
        do {
            guard let draft else { throw NestAPIFailure.invalid }
            try model.prepare(draft)
            notice = nil
        } catch { notice = "Check the new description, future date, current people and exact CHF split." }
    }

    private func recovery(_ saved: SavedLegacyAdoption) -> some View {
        Section("Saved adoption") {
            if let receipt = saved.result?.receipt {
                Text("Rule adopted. Old history is unchanged; no expense was recorded by this save.")
                NavigationLink("View current rule") {
                    RecurringRuleScreen(session: session, member: member, ruleId: receipt.input.ruleId)
                        .id(session.generation)
                }
            } else if saved.result?.status == .cancelled {
                Text("Request cancelled. This request did not adopt the rule.")
            } else {
                Text("Not confirmed. Keep these exact terms until the saved request is resolved.")
                Button(saved.cancellationRequested ? "Retry cancellation" : "Check and retry adoption") {
                    Task { await model.retry() }
                }
                if !saved.cancellationRequested { Button("Cancel pending request") { cancellation = true } }
            }
            if let result = saved.result, result.status != .unresolved {
                Button("Finish recovery") { Task { if await model.finish() { dismiss() } } }
            }
        }
    }
}
