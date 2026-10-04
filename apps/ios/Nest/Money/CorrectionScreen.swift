import SwiftUI

struct CorrectionScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let sourceEventId: UUID
    @State private var context: ExpenseContext?
    @State private var source: CorrectionContext?
    @State private var draft: CorrectionDraft?
    @State private var reviewed: CorrectionInput?
    @State private var saved: SavedCorrection?
    @State private var working = false
    @State private var notice: String?
    @State private var confirmCancel = false
    @FocusState private var focusedField: String?

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let saved {
                summary(saved.command.correction)
                recovery(saved)
            } else if let reviewed {
                summary(reviewed)
                Section {
                    Button("Confirm correction") { Task { await save() } }
                    Button("Edit") { self.reviewed = nil }
                    Button("Reload entry and edit") {
                        self.reviewed = nil
                        Task {
                            guard let context else { return }
                            await perform { try await reload(context, preserveDraft: true) }
                        }
                    }
                }
            } else if let source, draft != nil, source.canReverse || source.canReplace {
                fields(source)
            } else {
                Section {
                    if source != nil {
                        Text("This entry cannot be corrected while linked refunds or later changes remain active.")
                    }
                    Button("Load correction details") { Task { await load() } }
                }
            }
        }
        .disabled(working)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .navigationTitle("Correct entry")
        .scrollDismissesKeyboard(.interactively)
        .modifier(
            MoneyDraftKeyboard(
                focus: $focusedField, review: keyboardReview,
                reviewLabel: "Review correction", reviewIdentifier: "correction.keyboard-review")
        )
        .task { await load() }
        .confirmationDialog("Cancel this pending correction?", isPresented: $confirmCancel) {
            Button("Cancel pending correction", role: .destructive) { Task { await resolve(cancel: true) } }
        } message: {
            Text("An already recorded correction stays in financial history.")
        }
    }

    @ViewBuilder
    private func fields(_ source: CorrectionContext) -> some View {
        Section("Original entry") {
            Text(source.source.event.description).font(.headline)
            Text(source.source.event.amountCentimes.absoluteCHF)
            Text("The original stays in your history. Undo its effect, or replace it with corrected details.")
                .font(.footnote)
            Picker("Correction", selection: Binding(get: { draft?.replace ?? false }, set: { draft?.replace = $0 })) {
                if source.canReverse { Text("Undo entry").tag(false) }
                if source.canReplace { Text("Replace entry").tag(true) }
            }
        }
        if draft?.replace == true {
            Section("Replacement") {
                field("Description", key: \.description)
                field("Amount (CHF)", key: \.amount)
                Picker("Payer", selection: Binding(get: { draft?.payer ?? member.userId }, set: { draft?.payer = $0 }))
                {
                    ForEach(source.source.shares) { Text(name($0.memberId)).tag($0.memberId) }
                }
                if source.source.event.kind != .openingBalance {
                    ForEach(source.source.shares) { share in
                        MoneyDraftField(
                            label: share.memberId == member.userId ? "Your share (CHF)" : "Partner’s share (CHF)",
                            text: Binding(
                                get: { draft?.shares[share.memberId] ?? "" },
                                set: { draft?.shares[share.memberId] = $0 }),
                            focus: $focusedField, keyboard: .decimalPad, focusKey: share.memberId.uuidString)
                    }
                }
                field("Date (YYYY-MM-DD)", key: \.date)
                field("Note (optional)", key: \.note)
                if source.source.event.hasReceipt {
                    Text("The receipt remains with the original entry.").font(.footnote)
                }
            }
        }
        Section { Button("Review correction") { review() } }
    }

    private func field(_ label: String, key: WritableKeyPath<CorrectionDraft, String>) -> some View {
        MoneyDraftField(
            label: label, text: Binding(get: { draft?[keyPath: key] ?? "" }, set: { draft?[keyPath: key] = $0 }),
            focus: $focusedField, keyboard: key == \.amount ? .decimalPad : .default)
    }

    private func summary(_ input: CorrectionInput) -> some View {
        Section("Review correction") {
            NavigationLink("View original entry") {
                MoneyDetailScreen(session: session, member: member, eventId: input.sourceEventId)
            }
            switch input.replacement {
            case .expense(let expense):
                Text("Replace with: \(expense.description)").font(.headline)
                Text(expense.amountCentimes.absoluteCHF)
                LabeledContent("Payer", value: name(expense.payerId))
                ForEach(expense.allocations, id: \.memberId) {
                    LabeledContent(name($0.memberId), value: $0.centimes.absoluteCHF)
                }
                Text(expense.date.value)
                if let note = expense.note { Text(note) }
            case .opening(let opening):
                Text("Replace opening balance: \(opening.description)").font(.headline)
                Text(opening.amountCentimes.absoluteCHF)
                LabeledContent("Owed to", value: name(opening.payerId))
                Text(opening.date.value)
                if let note = opening.note { Text(note) }
            case nil: Text("Undo the effect of this entry.").font(.headline)
            }
            Text("Financial history is preserved. Nest records the correction without moving money.").font(.footnote)
        }
    }

    private func recovery(_ saved: SavedCorrection) -> some View {
        Section("Correction status") {
            if let receipt = saved.result?.receipt {
                Text("Correction recorded.")
                NavigationLink("View correction") {
                    MoneyDetailScreen(
                        session: session, member: member,
                        eventId: receipt.replacementEventId ?? receipt.reversalEventId)
                }
                Button("Done") { Task { await finish() } }
            } else if saved.result?.status == .cancelled {
                Text("This request was cancelled.")
                Button("Start again") { Task { await finish() } }
            } else {
                Text("Not confirmed yet. Resolve this saved request before recording another correction.")
                Button(saved.cancellationRequested ? "Retry cancellation" : "Check and retry") {
                    Task { await resolve(cancel: false) }
                }
                if !saved.cancellationRequested { Button("Cancel pending correction") { confirmCancel = true } }
            }
        }
    }

    private func name(_ id: UUID) -> String { id == member.userId ? "You" : "Your partner" }
    private var keyboardReview: (() -> Void)? {
        guard saved == nil, reviewed == nil, draft != nil, !working else { return nil }
        return { review() }
    }
    private func load() async {
        await perform {
            let current = try session.expenseContext()
            context = current
            saved = try await session.savedCorrection(current)
            if saved == nil { try await reload(current, preserveDraft: draft != nil) }
        }
    }
    private func reload(_ context: ExpenseContext, preserveDraft: Bool = false) async throws {
        let previous = preserveDraft ? draft : nil
        source = nil
        if !preserveDraft { draft = nil }
        let value = try await session.readCorrectionContext(context, sourceEventId: sourceEventId)
        source = value
        if value.canReverse || value.canReplace {
            draft = try previous ?? CorrectionDraft(source: value.source)
            if previous == nil { draft?.replace = !value.canReverse }
        }
    }
    private func review() {
        focusedField = nil
        do {
            guard let draft, let source else { throw NestAPIFailure.invalid }
            reviewed = try draft.reviewed(context: source, member: member)
            notice = nil
        } catch { notice = "Check the date and amounts. Both shares must add up to the replacement total." }
    }
    private func save() async {
        guard let context, let reviewed else { return }
        await perform {
            try await session.stageCorrection(reviewed, context: context)
            saved = try await session.savedCorrection(context)
            self.reviewed = nil
            saved = try await session.retryCorrection(context)
        }
    }
    private func resolve(cancel: Bool) async {
        guard let context else { return }
        await perform {
            saved = try await (cancel ? session.cancelCorrection(context) : session.retryCorrection(context))
        }
    }
    private func finish() async {
        guard let context, let saved else { return }
        await perform {
            try await session.finishCorrection(context, operation: saved.command.operationId)
            self.saved = nil
            reviewed = nil
            try await reload(context)
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
            if let context { saved = try? await session.savedCorrection(context) }
            notice =
                saved == nil
                ? "Could not start this correction. Connect and reload the entry before reviewing again. Your draft is kept."
                : "Could not confirm this action. Resolve any saved request before trying a new correction."
        }
    }
}
