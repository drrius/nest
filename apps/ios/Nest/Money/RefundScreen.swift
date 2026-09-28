import SwiftUI

struct RefundScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let sourceEventId: UUID
    @State private var context: ExpenseContext?
    @State private var source: RefundContext?
    @State private var saved: SavedRefund?
    @State private var reviewed: RefundInput?
    @State private var shares: [UUID: String] = [:]
    @State private var payer: UUID?
    @State private var description = "Refund"
    @State private var note = ""
    @State private var date = Date()
    @State private var working = false
    @State private var notice: String?
    @State private var confirmCancel = false

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let saved {
                summary(saved.command.refund)
                recovery(saved)
            } else if let reviewed {
                summary(reviewed)
                Section {
                    Button("Record refund") { Task { await save() } }
                    Button("Edit") { self.reviewed = nil }
                }
            } else if let source, source.refundable {
                fields(source)
            } else {
                Section {
                    if source != nil { Text("No refundable amount remains on this entry.") }
                    Button("Load refund details") { Task { await load() } }
                }
            }
        }
        .disabled(working)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .navigationTitle("Record refund")
        .task { await load() }
        .confirmationDialog("Cancel this pending refund?", isPresented: $confirmCancel) {
            Button("Cancel pending refund", role: .destructive) { Task { await resolve(cancel: true) } }
        } message: {
            Text("An already recorded refund stays in financial history.")
        }
    }

    private func fields(_ source: RefundContext) -> some View {
        Section("Refund already received") {
            Text(source.source.event.description).font(.headline)
            Text("Record money returned for this expense. The original entry stays in your history.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
            TextField("Description", text: $description)
            Picker("Received by", selection: $payer) {
                ForEach(source.remaining, id: \.memberId) { share in
                    Text(name(share.memberId)).tag(Optional(share.memberId))
                }
            }
            ForEach(source.remaining, id: \.memberId) { share in
                VStack(alignment: .leading) {
                    Text("\(name(share.memberId)) · up to \(share.centimes.absoluteCHF)").font(.caption)
                    TextField(
                        "Refund share (CHF)",
                        text: Binding(
                            get: { shares[share.memberId] ?? "" }, set: { shares[share.memberId] = $0 })
                    )
                    .keyboardType(.decimalPad)
                }
            }
            DatePicker("Refund date", selection: $date, displayedComponents: .date)
            TextField("Note (optional)", text: $note, axis: .vertical).lineLimit(2...5)
            Button("Review refund") { review(source) }
        }
    }

    private func summary(_ input: RefundInput) -> some View {
        Section("Review refund") {
            Text(input.description).font(.headline)
            LabeledContent("Received by", value: name(input.payerId))
            LabeledContent("Total", value: input.amountCentimes.absoluteCHF)
            ForEach(input.allocations, id: \.memberId) { share in
                LabeledContent(name(share.memberId), value: share.centimes.absoluteCHF)
            }
            LabeledContent("Date", value: input.date.value)
            if let note = input.note { Text(note) }
            Text("This records a refund already received; Nest does not move money.").font(.footnote)
        }
    }

    private func recovery(_ saved: SavedRefund) -> some View {
        Section("Refund status") {
            if let receipt = saved.result?.receipt {
                Text("Refund recorded.")
                NavigationLink("View recorded refund") {
                    MoneyDetailScreen(session: session, member: member, eventId: receipt.eventId)
                }
                Button("Done") { Task { await finish() } }
            } else if saved.result?.status == .cancelled {
                Text("This request was cancelled.")
                Button("Start again") { Task { await finish() } }
            } else {
                Text("Not confirmed yet. Resolve this saved request before recording another refund.")
                Button(saved.cancellationRequested ? "Retry cancellation" : "Check and retry") {
                    Task { await resolve(cancel: false) }
                }
                if !saved.cancellationRequested { Button("Cancel pending refund") { confirmCancel = true } }
            }
        }
    }

    private func name(_ id: UUID) -> String { id == member.userId ? "You" : "Your partner" }

    private func load() async {
        await perform {
            let current = try session.expenseContext()
            context = current
            saved = try await session.savedRefund(current)
            if saved == nil {
                source = nil
                source = try await session.readRefundContext(current, sourceEventId: sourceEventId)
                payer = source?.source.event.payerId
            }
        }
    }

    private func review(_ source: RefundContext) {
        do {
            guard let payer else { throw NestAPIFailure.invalid }
            let allocations = try source.remaining.map {
                ExpenseAllocation(memberId: $0.memberId, centimes: try ExpenseSplit.parseCHF(shares[$0.memberId] ?? ""))
            }
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd"
            reviewed = try RefundInput(
                sourceEventId: source.source.event.id,
                description: description.trimmingCharacters(in: .whitespacesAndNewlines),
                amountCentimes: Centimes(String(allocations.reduce(Int64(0), { $0 + $1.centimes.value }))),
                payerId: payer, allocations: allocations, expectedRemaining: source.remaining,
                date: CivilDate(formatter.string(from: date)), note: note.isEmpty ? nil : note
            ).validated(member: member)
            notice = nil
        } catch { notice = "Enter both refund shares, using 0 where needed. Neither can exceed its remaining amount." }
    }

    private func save() async {
        guard let context, let reviewed else { return }
        await perform {
            try await session.stageRefund(reviewed, context: context)
            saved = try await session.savedRefund(context)
            self.reviewed = nil
            saved = try await session.retryRefund(context)
        }
    }

    private func resolve(cancel: Bool) async {
        guard let context else { return }
        await perform { saved = try await (cancel ? session.cancelRefund(context) : session.retryRefund(context)) }
    }

    private func finish() async {
        guard let context, let saved else { return }
        await perform {
            try await session.finishRefund(context, operation: saved.command.operationId)
            self.saved = nil
            reviewed = nil
            shares = [:]
            source = nil
            source = try await session.readRefundContext(context, sourceEventId: sourceEventId)
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
            if let context { saved = try? await session.savedRefund(context) }
            notice = "Could not confirm this action. Resolve any saved request before reviewing updated refund amounts."
        }
    }
}
