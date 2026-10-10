import SwiftUI

struct LegacyConfirmationScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model: LegacyConfirmationModel
    @State private var draft: ExpenseDraft
    @State private var date = Date()
    @State private var categoryName: String?
    @State private var notice: String?
    @State private var confirmation: LegacyConfirmationReview?
    @State private var cancellation = false
    @FocusState private var focused: ExpenseFormFields.Field?
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss

    init(session: SessionModel, member: VerifiedMember, draftId: UUID?) {
        self.session = session
        self.member = member
        _model = StateObject(wrappedValue: LegacyConfirmationModel(session: session, member: member, draftId: draftId))
        _draft = State(initialValue: ExpenseDraft(payer: member.userId))
    }

    var body: some View {
        Form {
            if let saved = model.saved {
                LegacyReviewedDraftTerms(draft: saved.reviewed.draft, member: member)
                ExpenseReviewSection(
                    expense: saved.command.input.expense, member: member, members: model.members,
                    unknownMemberLabel: "Other member at review")
                recovery(saved)
            } else if let original = model.currentDraft {
                LegacyReviewedDraftTerms(draft: original.draft, member: member)
                if original.canDismiss {
                    editor
                } else {
                    Text("Only unposted recurring drafts without a linked entry can become a new expense here.")
                }
            } else if model.loaded {
                Text("No saved draft confirmation.")
            }
            if let notice = notice ?? model.notice { Section { Text(notice) } }
            Section {
                Button("Reload draft and people") {
                    Task {
                        notice = nil
                        await model.load()
                    }
                }
            }
        }
        .disabled(model.working)
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Draft expense")
        .toolbar { keyboardActions }
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if model.working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task(id: session.generation) { await model.load() }
        .onChange(of: phase) { _, phase in
            confirmation = nil
            cancellation = false
            if phase == .active { Task { await model.load() } } else { model.suspendReview() }
        }
        .alert(
            "Record expense?",
            isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } })
        ) {
            if let expected = confirmation { Button("Record") { Task { await model.confirm(expected) } } }
            Button("Cancel", role: .cancel) { confirmation = nil }
        } message: {
            Text("Changes your shared balance.")
        }
        .alert("Cancel request?", isPresented: $cancellation) {
            Button("Cancel request", role: .destructive) { Task { await model.retry(cancel: true) } }
            Button("Keep", role: .cancel) { cancellation = false }
        } message: {
            Text("Recorded results win.")
        }
    }

    @ToolbarContentBuilder private var keyboardActions: some ToolbarContent {
        ToolbarItemGroup(placement: .keyboard) {
            Button {
                focused = nil
            } label: {
                Text("Done").fixedSize().frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Spacer()
            if model.saved == nil, model.currentDraft?.canDismiss == true, model.review == nil {
                Button {
                    prepare()
                } label: {
                    Text("Review").fixedSize().frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Review new expense")
                .accessibilityIdentifier("legacy-confirmation.keyboard-review")
            }
        }
    }

    @ViewBuilder private var editor: some View {
        if let review = model.review {
            ExpenseReviewSection(
                expense: review.expense, member: member, members: model.members, categoryName: categoryName)
            Section {
                Text(
                    "This records the new expense shown above and links it to the retained draft. The old rule is not enabled for automatic posting."
                )
                Button("Record reviewed expense") { confirmation = review }
                Button("Edit new expense") { model.edit() }
            }
        } else {
            QuietFormSection("Choose a new expense") {
                Text(
                    "Original terms are shown separately. Choose the amount, people, split and date for the new expense. Receipt attachments and separate receipt totals are unavailable for this conversion."
                )
            }
            ExpenseFormFields(
                draft: $draft, date: $date, members: model.members, focus: $focused, allowsReceiptTotal: false)
            Section {
                NavigationLink(categoryName ?? "Choose category (optional)") {
                    ExpenseCategoryPicker(
                        session: session, member: member, selection: $draft.categoryId, selectedName: $categoryName)
                }
                Button("Review new expense") { prepare() }
            }
        }
    }

    private func prepare() {
        focused = nil
        do {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = .current
            formatter.dateFormat = "yyyy-MM-dd"
            let input = try draft.reviewed(
                member: member, members: model.members.map(\.id), date: CivilDate(formatter.string(from: date)))
            try model.prepare(input)
            notice = nil
        } catch {
            notice =
                "Check the new description, CHF amount, current people and exact split. Reload online if the draft changed."
        }
    }

    private func recovery(_ saved: SavedLegacyConfirmation) -> some View {
        QuietFormSection("Saved confirmation") {
            if let receipt = saved.result?.receipt {
                Text(
                    "Expense recorded and linked to this draft. No bank transfer occurred and the old rule remains unchanged."
                )
                NavigationLink("View recorded entry") {
                    MoneyDetailScreen(session: session, member: member, eventId: receipt.eventId).id(session.generation)
                }
            } else if saved.result?.status == .cancelled {
                Text("Request cancelled. This request did not record an expense.")
            } else {
                Text("Not confirmed. Check the exact saved request before recording this draft again.")
                Button(saved.cancellationRequested ? "Retry cancellation" : "Check and retry confirmation") {
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
