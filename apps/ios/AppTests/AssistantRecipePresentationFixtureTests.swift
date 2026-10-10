import SwiftUI
import UIKit
import XCTest

@testable import Nest

/// Explicit, read-only UI fixture. This does not establish live model or hosted transcript acceptance.
@MainActor
final class AssistantRecipePresentationFixtureTests: XCTestCase {
    func testInspectRecipeHistoryDestinationsOnOwnedSimulator() async throws {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_TEST_RECIPE_PRESENTATION"] == "inspect" else {
                throw XCTSkip("Requires explicit recipe presentation inspection.")
            }
            guard environment["SIMULATOR_UDID"] == "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A" else {
                return XCTFail("Recipe presentation fixture requires the owned clean simulator")
            }
            let complete = URL(filePath: "/private/tmp/nest-assistant-recipe-presentation-complete")
            guard !FileManager.default.fileExists(atPath: complete.path) else {
                return XCTFail("Stale presentation completion marker")
            }
            let (model, member, conversation, directory) = try await fixture()
            defer { try? FileManager.default.removeItem(at: directory) }
            let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
            let previous = scene.windows.first(where: \.isKeyWindow)
            let window = UIWindow(windowScene: scene)
            window.rootViewController = UIHostingController(
                rootView:
                    NavigationStack {
                        AssistantHistoryScreen(session: model, member: member, conversationId: conversation)
                    }.tint(QuietPalette.accent))
            window.makeKeyAndVisible()
            let previousHidden = previous?.isHidden
            previous?.isHidden = true
            defer {
                window.isHidden = true
                if let previousHidden { previous?.isHidden = previousHidden }
                previous?.makeKeyAndVisible()
                try? FileManager.default.removeItem(at: complete)
            }
            for _ in 0..<180 {
                if FileManager.default.fileExists(atPath: complete.path) { return }
                try await Task.sleep(for: .seconds(1))
            }
            XCTFail("Native recipe presentation inspection did not finish")
        #else
            throw XCTSkip("Recipe presentation inspection is forbidden on physical devices.")
        #endif
    }

    private func fixture() async throws -> (SessionModel, VerifiedMember, UUID, URL) {
        let actor = UUID()
        let partner = UUID()
        let household = UUID()
        let conversation = UUID()
        let auth = FakeAuthentication(active: .init(userId: actor, accessToken: "token-A"))
        let chores = FakeChoreServer(actorA: actor, actorB: partner, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let meals = FakeMealServer(actorA: actor, actorB: partner, household: household)
        let recipe = await meals.savedRecipeId()
        let mealHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await meals.respond($0) }
        let member = VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
        let data = try transcript(member: member, conversation: conversation, recipe: recipe)
        let assistantHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP),
            offline: try ChoreOfflineStore(url: directory.appendingPathComponent("fixture.sqlite")),
            mealAPI: MealAPI(http: mealHTTP), assistantAPI: AssistantAPI(http: assistantHTTP))
        await model.restore()
        XCTAssertEqual(model.status, .ready(member))
        guard model.status == .ready(member) else { throw NestAPIFailure.unavailable }
        return (model, member, conversation, directory)
    }

    private func transcript(member: VerifiedMember, conversation: UUID, recipe: UUID) throws -> Data {
        let operation = UUID()
        let common: [String: Any] = [
            "version": 1, "actorId": member.userId.uuidString,
            "householdId": member.householdId.uuidString, "operationId": operation.uuidString,
            "definitionId": recipe.uuidString, "revision": "4",
        ]
        let ingredient: [String: Any] = [
            "name": "Pasta", "quantity": "200", "unit": "g",
            "categoryId": NSNull(), "note": NSNull(),
        ]
        let draft: [String: Any] = [
            "title": "Alex pasta", "servings": 2, "ingredients": [ingredient],
            "instructions": "Cook.", "recipeUrl": NSNull(), "notes": NSNull(),
        ]
        let saved = part("createRecipe", input: ["expectedRevision": "2", "recipe": draft], receipt: common)
        let archived = part(
            "archiveRecipe", input: ["expectedRevision": "3", "definitionId": recipe.uuidString],
            receipt: common)
        for result in [saved, archived] {
            let value = try JSONDecoder().decode(
                [String: AssistantJSON].self,
                from: JSONSerialization.data(withJSONObject: result))
            _ = try XCTUnwrap(AssistantRecipeLink.read(value, member: member))
        }
        let messages: [[String: Any]] = [
            ["id": "saved-fixture", "role": "assistant", "parts": [saved]],
            ["id": "archived-fixture", "role": "assistant", "parts": [archived]],
        ]
        return try JSONSerialization.data(withJSONObject: [
            "version": 1,
            "conversation": ["conversationId": conversation.uuidString, "revision": "1", "messages": messages],
        ])
    }

    private func part(_ tool: String, input: [String: Any], receipt: [String: Any]) -> [String: Any] {
        [
            "type": "tool-\(tool)", "toolCallId": tool, "state": "output-available", "input": input,
            "output": ["ok": true, "value": receipt],
        ]
    }
}
