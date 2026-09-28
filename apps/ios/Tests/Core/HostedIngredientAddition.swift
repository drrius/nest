import Foundation
import XCTest

@testable import NestCore

extension HostedRecipeEditTests {
    func verifyIngredientAddition(
        _ row: MealIngredient, listing: MealIngredientListing,
        api: MealAPI, token: String, outsider: String, member: VerifiedMember
    ) async throws {
        let grocery = GroceryAPI(
            http: try NestHTTP(baseURL: URL(string: "https://nest-test-api-drrius-projects.vercel.app")!))
        let command = AddMealIngredients(
            operationId: UUID(), weekStart: listing.week, expectedRevision: listing.revision,
            selected: [.init(entryId: row.entryId, ingredientId: row.ingredientId, quantity: "1/2", unit: "cup")])
        do {
            _ = try await api.addIngredients(token: outsider, member: member, command: command)
            XCTFail("Outsider added household ingredients")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        do {
            let receipt = try await api.addIngredients(token: token, member: member, command: command)
            let replay = try await api.addIngredients(token: token, member: member, command: command)
            XCTAssertEqual(receipt, replay)
            let repeated = AddMealIngredients(
                operationId: UUID(), weekStart: listing.week,
                expectedRevision: listing.revision, selected: command.selected)
            let again = try await api.addIngredients(token: token, member: member, command: repeated)
            XCTAssertEqual(again.ingredients.first?.outcome, .alreadyAdded)
            XCTAssertEqual(again.ingredients.first?.itemId, receipt.ingredients.first?.itemId)
            let groceries = try await grocery.list(token: token, member: member)
            let id = try XCTUnwrap(receipt.ingredients.first?.itemId)
            let item = try XCTUnwrap(groceries.groceries.first { $0.id == id })
            XCTAssertEqual(item.name, row.name)
            XCTAssertEqual(item.quantity, "1/2")
            XCTAssertEqual(item.unit, "cup")
            let updated = try await api.allIngredients(
                token: token, member: member, week: listing.week, revision: listing.revision)
            XCTAssertEqual(updated.ingredients.first { $0.id == row.id }?.groceryItemId, id)
        } catch {
            try await cleanupIngredient(row, listing: listing, api: api, grocery: grocery, token: token, member: member)
            throw error
        }
        try await cleanupIngredient(row, listing: listing, api: api, grocery: grocery, token: token, member: member)
    }

    private func cleanupIngredient(
        _ row: MealIngredient, listing: MealIngredientListing, api: MealAPI,
        grocery: GroceryAPI, token: String, member: VerifiedMember
    ) async throws {
        let current = try await api.allIngredients(
            token: token, member: member, week: listing.week, revision: listing.revision)
        guard let id = current.ingredients.first(where: { $0.id == row.id })?.groceryItemId else { return }
        let groceries = try await grocery.list(token: token, member: member)
        guard let item = groceries.groceries.first(where: { $0.id == id }) else { return }
        _ = try await grocery.remove(
            token: token, member: member, item: item, command: RemoveGrocery(item: item, operationId: UUID()))
        let after = try await grocery.list(token: token, member: member)
        XCTAssertFalse(after.groceries.contains { $0.id == id })
    }
}
