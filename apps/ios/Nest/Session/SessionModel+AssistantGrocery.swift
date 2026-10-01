import Foundation

extension SessionModel {
    func readAssistantGrocery(
        _ result: AssistantGroceryActionLink, context: AssistantContext
    ) async throws -> GroceryItem? {
        let token = try await assistantToken(context)
        guard let groceryAPI else { throw NestAPIFailure.configuration }
        let list = try await groceryAPI.list(token: token, member: context.member)
        try requireAssistantAccount(context)
        let item = list.groceries.first { $0.id == result.itemId }
        if let item {
            guard let current = Int64(item.version), let confirmed = Int64(result.version), current >= confirmed else {
                throw GroceryContractError.invalidSnapshot
            }
        }
        return item
    }
}
