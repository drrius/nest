import Foundation
import XCTest

@testable import NestCore

final class MealRecipePlacementTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let household = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let definition = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let entry = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!

    private var member: VerifiedMember {
        VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
    }

    func testCommandCapturesWeekAndLibraryRevisionsAndRefusesOccupiedSlot() throws {
        let week = try snapshot(placed: false)
        let recipe = try savedRecipe()
        let command = try PlaceSavedRecipe(
            week: week, recipe: recipe, libraryRevision: "3",
            operationId: UUID(), date: try CivilDate("2026-09-29"), slot: .dinner)
        XCTAssertEqual(command.expectedRevision, "0")
        XCTAssertEqual(command.expectedLibraryRevision, "3")
        XCTAssertEqual(command.definitionId, definition)
        XCTAssertThrowsError(try command.validated(against: snapshot(placed: true), recipe: recipe))
    }

    func testReceiptBindsActorOperationRecipeLibraryAndNextRevision() throws {
        let week = try snapshot(placed: false)
        let recipe = try savedRecipe()
        let command = try PlaceSavedRecipe(
            week: week, recipe: recipe, libraryRevision: "3",
            operationId: UUID(), date: try CivilDate("2026-09-29"), slot: .dinner)
        let body = receiptBody(command)
        let receipt = try JSONDecoder().decode(MealRecipePlacementReceipt.self, from: Data(body.utf8))
        XCTAssertNoThrow(try receipt.validated(member: member, command: command))
        for invalidBody in [
            body.replacingOccurrences(of: actor.uuidString, with: UUID().uuidString),
            body.replacingOccurrences(of: command.operationId.uuidString, with: UUID().uuidString),
            body.replacingOccurrences(of: definition.uuidString, with: UUID().uuidString),
            body.replacingOccurrences(of: "\"libraryRevision\":\"3\"", with: "\"libraryRevision\":\"4\""),
            body.replacingOccurrences(of: "\"revision\":\"1\"", with: "\"revision\":\"2\""),
        ] {
            let wrong = try JSONDecoder().decode(
                MealRecipePlacementReceipt.self, from: Data(invalidBody.utf8))
            XCTAssertThrowsError(try wrong.validated(member: member, command: command))
        }
    }

    func testAPIUsesExactSavedRecipeCommandAndRejectsForeignReceipt() async throws {
        let week = try snapshot(placed: false)
        let recipe = try savedRecipe()
        let command = try PlaceSavedRecipe(
            week: week, recipe: recipe, libraryRevision: "3",
            operationId: UUID(), date: try CivilDate("2026-09-29"), slot: .dinner)
        let body =
            "{\"version\":1,\"receipt\":\(receiptBody(command).replacingOccurrences(of: actor.uuidString, with: UUID().uuidString))}"
        let householdHeader = household.uuidString.lowercased()
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            XCTAssertEqual(request.url?.path, "/v1/meals/recipe/place")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-Household"), householdHeader)
            let payload = try? JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
            XCTAssertEqual(payload?["operationId"] as? String, command.operationId.uuidString)
            XCTAssertEqual(payload?["definitionId"] as? String, command.definitionId.uuidString)
            XCTAssertEqual(payload?["expectedLibraryRevision"] as? String, "3")
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (Data(body.utf8), response)
        }
        do {
            _ = try await MealAPI(http: http).placeRecipe(
                token: "member-token", member: member, week: week,
                recipe: recipe, command: command)
            XCTFail("Foreign actor receipt was accepted")
        } catch { XCTAssertTrue(error is MealContractError) }
    }

    private func snapshot(placed: Bool) throws -> MealWeekSnapshot {
        let row = """
            {"entryId":"\(entry)","date":"2026-09-29","slot":"dinner","title":"Pasta","recipeUrl":null,"notes":null,"definitionId":"\(definition)","leftoverSourceId":null}
            """
        let body = """
            {"version":1,"householdId":"\(household)","weekStart":"2026-09-28","revision":"\(placed ? "1" : "0")","entries":[\(placed ? row : "")]}
            """
        return try JSONDecoder().decode(MealWeekSnapshot.self, from: Data(body.utf8))
    }

    private func savedRecipe() throws -> SavedRecipe {
        let body = """
            {"definitionId":"\(definition)","title":"Pasta","servings":2,"recipeUrl":null,"notes":null,"instructions":"Cook it.","ingredients":[]}
            """
        return try JSONDecoder().decode(SavedRecipe.self, from: Data(body.utf8))
    }

    private func receiptBody(_ command: PlaceSavedRecipe) -> String {
        """
        {"version":1,"actorId":"\(actor)","householdId":"\(household)","operationId":"\(command.operationId)","entryId":"\(entry)","weekStart":"2026-09-28","date":"2026-09-29","slot":"dinner","revision":"1","definitionId":"\(definition)","libraryRevision":"3"}
        """
    }
}
