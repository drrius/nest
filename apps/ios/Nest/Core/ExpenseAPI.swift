import Foundation

extension MoneyAPI {
    func saveExpense(token: String, member: VerifiedMember, command: SaveExpense) async throws -> ExpenseReceipt {
        _ = try command.expense.validated(member: member)
        let receipt = try await http.write(
            "v1/money/expense/save", token: token, household: member.householdId, body: command, as: ExpenseReceipt.self
        )
        return try receipt.validated(member: member, command: command)
    }

    func recoverExpense(token: String, member: VerifiedMember, command: SaveExpense) async throws -> ExpenseRecovery {
        _ = try command.expense.validated(member: member)
        let result = try await http.read(
            "v1/money/expense/receipt?operationId=\(command.operationId.uuidString.lowercased())",
            token: token, household: member.householdId, as: ExpenseRecovery.self)
        return try result.validated(member: member, command: command)
    }

    func cancelExpense(token: String, member: VerifiedMember, command: SaveExpense) async throws -> ExpenseRecovery {
        struct Cancellation: Encodable { let operationId: UUID }
        _ = try command.expense.validated(member: member)
        let result = try await http.write(
            "v1/money/expense/cancel", token: token, household: member.householdId,
            body: Cancellation(operationId: command.operationId), as: ExpenseRecovery.self)
        return try result.validated(member: member, command: command, cancellation: true)
    }
}
