import Foundation

extension SessionModel {
    func stageRenewalChange(
        _ command: RenewalCommand, baseline: CalendarRenewal?, context: RenewalContext
    ) async throws {
        _ = try command.validated()
        let token = try await renewalToken(context)
        guard let offline, let chores else { throw NestAPIFailure.configuration }
        let roster = try await chores.routineRoster(token: token, member: context.member)
        try requireRenewalAccount(context)
        if let id = command.fields?.responsibleId, !roster.members.contains(where: { $0.actorId == id }) {
            throw NestAPIFailure.invalid
        }
        if let baseline {
            let current = try await readRenewal(context, id: command.renewalId)
            guard current == baseline else { throw NestAPIFailure.conflict }
        }
        if let id = command.fields?.recurringRuleId {
            guard let moneyAPI else { throw NestAPIFailure.configuration }
            _ = try await moneyAPI.recurringRule(token: token, member: context.member, ruleId: id)
            try requireRenewalAccount(context)
        }
        try await offline.stageRenewalRequest(
            .init(baseline: baseline, command: command, result: nil), lease: context.lease)
        try requireRenewalAccount(context)
    }

    func retryRenewalChange(_ context: RenewalContext) async throws {
        guard let saved = try await savedRenewalRequest(context), let renewalAPI, let offline else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return }
        let token = try await renewalToken(context)
        let result = try await renewalAPI.recover(
            token: token, member: context.member, command: saved.command, cancel: saved.cancellationRequested)
        try requireRenewalAccount(context)
        try await offline.recordRenewalRecovery(result, lease: context.lease)
        try requireRenewalAccount(context)
        guard result.status == .unresolved else { return }
        guard let current = try await savedRenewalRequest(context) else { throw OfflineFailure.invalidOperation }
        if current.cancellationRequested {
            let cancelled = try await renewalAPI.recover(
                token: token, member: context.member, command: current.command, cancel: true)
            try requireRenewalAccount(context)
            try await offline.recordRenewalRecovery(cancelled, lease: context.lease)
        } else {
            let receipt = try await renewalAPI.change(token: token, member: context.member, command: current.command)
            try requireRenewalAccount(context)
            try await offline.recordRenewalRecovery(
                .init(
                    version: receipt.version, actorId: receipt.actorId, householdId: receipt.householdId,
                    operationId: receipt.operationId, status: .recorded, receipt: receipt), lease: context.lease)
        }
        try requireRenewalAccount(context)
    }

    func cancelRenewalChange(_ context: RenewalContext) async throws {
        try requireRenewalAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestRenewalCancellation(lease: context.lease)
        try requireRenewalAccount(context)
        try await retryRenewalChange(context)
    }

    func finishRenewalChange(_ context: RenewalContext) async throws {
        guard let saved = try await savedRenewalRequest(context), let offline else {
            throw OfflineFailure.invalidOperation
        }
        try await offline.finishRenewalRequest(operation: saved.command.operationId, lease: context.lease)
        try requireRenewalAccount(context)
    }
}
