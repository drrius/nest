import SwiftUI

struct SettlementScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @State private var balance: MoneyBalance?
    @State private var context: ExpenseContext?
    @State private var draft = SettlementDraft()
    @State private var date = Date()
    @State private var reviewed: SettlementInput?
    @State private var saved: SavedSettlement?
    @State private var working = false
    @State private var notice: String?
    @State private var confirmCancel = false
    @FocusState private var focusedField: String?

    var body: some View {
        Form {
            Section {
                Text("Record a payment you’ve already made outside Nest. Nest does not transfer money.")
                    .foregroundStyle(QuietPalette.muted)
            }
            if let notice, !editingDraft { Section { Text(notice) } }
            if let saved {
                summary(saved.command.settlement)
                recovery(saved)
            } else if let reviewed {
                summary(reviewed)
                Section {
                    Button("Record payment") { Task { await save() } }
                    Button("Edit") { self.reviewed = nil }
                    Button("Reload balance and review again") {
                        reviewed = nil
                        Task { await load() }
                    }
                }
            } else if let balance {
                fields(balance)
            } else {
                Section { Button("Load current balance") { Task { await load() } } }
            }
        }
        .disabled(working)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .navigationTitle("Record payment")
        .modifier(MoneyDraftKeyboard(focus: $focusedField))
        .task { await load() }
        .confirmationDialog("Cancel this pending record?", isPresented: $confirmCancel) {
            Button("Cancel pending record", role: .destructive) { Task { await resolve(cancel: true) } }
        } message: {
            Text("If the payment was already recorded, it stays in your financial history.")
        }
    }

    private var editingDraft: Bool { balance != nil && saved == nil && reviewed == nil }

    @ViewBuilder private func fields(_ balance: MoneyBalance) -> some View {
        if let recipient = balance.members.first(where: { $0.centimes.value > 0 }),
            let payer = balance.members.first(where: { $0.centimes.value < 0 })
        {
            Section("Current balance") {
                Text("\(payer.displayName) owes \(recipient.displayName)")
                Text(recipient.centimes.absoluteCHF).font(.title2).monospacedDigit()
                Button("Reload balance") { Task { await load() } }
            }
            Section("Payment already made") {
                Picker("Amount", selection: $draft.mode) {
                    Text("Full balance").tag(SettlementInput.Mode.full)
                    Text("Partial amount").tag(SettlementInput.Mode.partial)
                }
                if draft.mode == .partial {
                    MoneyDraftField(
                        label: "Amount (CHF)", text: $draft.amount, focus: $focusedField, keyboard: .decimalPad)
                }
                DatePicker("Payment date", selection: $date, displayedComponents: .date)
                MoneyDraftField(label: "Note (optional)", text: $draft.note, focus: $focusedField)
                if let notice { Text(notice).font(.subheadline).foregroundStyle(QuietPalette.ink) }
                Button("Review payment") { review() }
            }
        } else {
            Section {
                Text("You’re settled up. There is no outstanding balance to record a payment against.")
                Button("Reload balance") { Task { await load() } }
            }
        }
    }

    private func summary(_ input: SettlementInput) -> some View {
        Section("Review payment") {
            LabeledContent("Paid by", value: name(input.payerId))
            LabeledContent("Paid to", value: name(input.recipientId))
            LabeledContent("Amount", value: input.amountCentimes.absoluteCHF)
            LabeledContent("Payment date", value: input.date.value)
            if let note = input.note { Text(note) }
            Text("Confirm only if this payment has already happened.").font(.footnote)
        }
    }

    private func recovery(_ saved: SavedSettlement) -> some View {
        Section("Record status") {
            if let receipt = saved.result?.receipt {
                Text("Payment recorded.")
                NavigationLink("View recorded payment") {
                    MoneyDetailScreen(session: session, member: member, eventId: receipt.eventId)
                }
                Button("Done") { Task { await finish() } }
            } else if saved.result?.status == .cancelled {
                Text("This request was cancelled without recording a payment.")
                Button("Start again with current balance") { Task { await finish() } }
            } else {
                Text("Not confirmed yet. Resolve this request before recording another payment.")
                Button(saved.cancellationRequested ? "Retry cancellation" : "Check and retry") {
                    Task { await resolve(cancel: false) }
                }
                if !saved.cancellationRequested { Button("Cancel pending record") { confirmCancel = true } }
            }
        }
    }

    private func name(_ id: UUID) -> String {
        id == member.userId ? "You" : balance?.members.first(where: { $0.id == id })?.displayName ?? "Your partner"
    }

    private func load() async {
        await perform {
            balance = nil
            let current = try session.expenseContext()
            context = current
            saved = try await session.savedSettlement(current)
            if saved == nil {
                balance = try await session.readMoneyBalance(member: member, generation: current.generation)
            }
        }
    }

    private func review() {
        focusedField = nil
        guard let balance else { return }
        do {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd"
            reviewed = try draft.reviewed(
                balance: balance, member: member, date: CivilDate(formatter.string(from: date)))
            notice = nil
        } catch { notice = "Enter a positive CHF amount no greater than the outstanding balance." }
    }

    private func save() async {
        guard let context, let reviewed else { return }
        await perform {
            try await session.stageSettlement(reviewed, context: context)
            saved = try await session.savedSettlement(context)
            self.reviewed = nil
            saved = try await session.retrySettlement(context)
        }
    }

    private func resolve(cancel: Bool) async {
        guard let context else { return }
        await perform {
            saved = try await (cancel ? session.cancelSettlement(context) : session.retrySettlement(context))
        }
    }

    private func finish() async {
        guard let context, let saved else { return }
        await perform {
            try await session.finishSettlement(context, operation: saved.command.operationId)
            self.saved = nil
            reviewed = nil
            draft = SettlementDraft()
            balance = nil
            balance = try await session.readMoneyBalance(member: member, generation: context.generation)
        }
    }

    private func perform(_ action: () async throws -> Void) async {
        guard !working else { return }
        working = true
        defer { working = false }
        do {
            try await action()
            notice = nil
        } catch {
            if let context { saved = try? await session.savedSettlement(context) }
            notice =
                saved == nil
                ? "Could not start this record. Connect and reload the balance before reviewing again. Your draft is kept."
                : "Could not confirm this action. Resolve the saved request before reviewing another payment."
        }
    }
}
