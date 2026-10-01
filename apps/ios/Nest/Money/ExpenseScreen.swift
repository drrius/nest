import SwiftUI

struct ExpenseScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @State private var draft: ExpenseDraft
    @State private var categoryName: String?
    @State private var date = Date()
    @State private var members: [MoneyBalance.Member] = []
    @State private var context: ExpenseContext?
    @State private var saved: SavedExpense?
    @State private var reviewed: ExpenseInput?
    @State private var notice: String?
    @State private var working = false
    @State private var loaded = false
    @State private var confirmCancel = false
    @State private var receiptReady = false
    @FocusState private var focusedField: ExpenseFormFields.Field?

    init(session: SessionModel, member: VerifiedMember) {
        self.session = session
        self.member = member
        _draft = State(initialValue: ExpenseDraft(payer: member.userId))
    }

    var body: some View {
        Form {
            if let notice, !editingDraft { Section { Text(notice) } }
            if let saved {
                ExpenseReviewSection(expense: saved.command.expense, member: member, members: members)
                recovery(saved)
            } else if let reviewed {
                ExpenseReviewSection(expense: reviewed, member: member, members: members, categoryName: categoryName)
                Section {
                    Button("Save expense") { Task { await saveReviewed() } }
                    Button("Edit") { self.reviewed = nil }
                    Button("Reload people and edit") {
                        reviewed = nil
                        Task { await load() }
                    }
                }
            } else if loaded {
                ExpenseFormFields(draft: $draft, date: $date, members: members, focus: $focusedField)
                Section {
                    NavigationLink(categoryName ?? "Choose category (optional)") {
                        ExpenseCategoryPicker(
                            session: session, member: member, selection: $draft.categoryId, selectedName: $categoryName)
                    }
                }
                if let context {
                    ExpenseReceiptSection(
                        session: session, context: context, path: $draft.receiptPath, ready: $receiptReady)
                }
                Section {
                    if let notice { Text(notice).font(.subheadline).foregroundStyle(QuietPalette.ink) }
                    Button("Review expense") { review() }.disabled(!receiptReady)
                }
            } else {
                Section { Button("Load expense form") { Task { await load() } } }
            }
        }
        .disabled(working)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .navigationTitle("Add expense")
        .task { await load() }
        .confirmationDialog("Cancel this pending save?", isPresented: $confirmCancel) {
            Button("Cancel pending save", role: .destructive) { Task { await resolve(cancel: true) } }
        } message: {
            Text(
                "Nest checks with the server. If the expense was already recorded, it stays in your financial history.")
        }
    }

    private var editingDraft: Bool { loaded && saved == nil && reviewed == nil }

    private func recovery(_ saved: SavedExpense) -> some View {
        Section("Save status") {
            if let receipt = saved.result?.receipt {
                Text("Expense recorded.")
                NavigationLink("View recorded entry") {
                    MoneyDetailScreen(session: session, member: member, eventId: receipt.eventId)
                }
                Button("Start another expense") { Task { await finish() } }
            } else if saved.result?.status == .cancelled {
                Text("The pending save was cancelled. No expense was recorded for this request.")
                Button("Start another expense") { Task { await finish() } }
            } else {
                Text(
                    saved.cancellationRequested
                        ? "Cancellation is not confirmed yet." : "The save is not confirmed yet.")
                Button(saved.cancellationRequested ? "Retry cancellation" : "Retry saved expense") {
                    Task { await resolve(cancel: false) }
                }
                if !saved.cancellationRequested { Button("Cancel pending save") { confirmCancel = true } }
            }
        }
    }

    private func load() async {
        working = true
        defer { working = false }
        do {
            let context = try session.expenseContext()
            self.context = context
            saved = try await session.savedExpense(context)
            if saved == nil {
                let balance = try await session.readMoneyBalance(member: member, generation: context.generation)
                members = balance.members
                loaded = true
            }
            notice = nil
        } catch { notice = "Could not load expense entry. Try again online." }
    }

    private func review() {
        focusedField = nil
        do {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = .current
            formatter.dateFormat = "yyyy-MM-dd"
            reviewed = try draft.reviewed(
                member: member, members: members.map(\.id), date: CivilDate(formatter.string(from: date)))
            notice = nil
        } catch {
            notice =
                "Check the description, CHF amounts and split. Exact shares must add up; percentages must be between 0 and 100."
        }
    }

    private func saveReviewed() async {
        guard let context, let reviewed else { return }
        working = true
        defer { working = false }
        do {
            try await session.stageExpense(reviewed, context: context)
            saved = try await session.savedExpense(context)
            self.reviewed = nil
            saved = try await session.retryExpense(context)
            notice = nil
        } catch {
            saved = try? await session.savedExpense(context)
            notice = saved == nil
                ? "Could not start this save. Connect and reload the people before reviewing again. Your draft is kept."
                : "Save not confirmed. Check the saved request before trying again."
        }
    }

    private func resolve(cancel: Bool) async {
        guard let context else { return }
        working = true
        defer { working = false }
        do {
            saved = try await (cancel ? session.cancelExpense(context) : session.retryExpense(context))
            notice = nil
        } catch {
            saved = try? await session.savedExpense(context)
            notice = "Could not confirm the result. Your request is retained for recovery."
        }
    }

    private func finish() async {
        guard let context, let saved else { return }
        working = true
        defer { working = false }
        do {
            try await session.finishExpense(context, operation: saved.command.operationId)
            self.saved = nil
            reviewed = nil
            draft = ExpenseDraft(payer: member.userId)
            categoryName = nil
            loaded = false
            await load()
        } catch { notice = "Could not finish this request. Try again." }
    }
}
