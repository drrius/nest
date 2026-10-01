import SwiftUI
import UIKit
import XCTest

@testable import Nest

/// Opted-in, read-only presentation inspection; not live AI or hosted acceptance.
@MainActor
final class AssistantMealPresentationFixtureTests: XCTestCase {
    func testInspectCurrentAndRemovedMealLinksOnOwnedSimulator() async throws {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_TEST_MEAL_PRESENTATION"] == "inspect" else {
                throw XCTSkip("Requires explicit meal presentation inspection.")
            }
            guard environment["SIMULATOR_UDID"] == "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A" else {
                return XCTFail("Meal presentation fixture requires the owned clean simulator")
            }
            let complete = URL(filePath: "/private/tmp/nest-assistant-meal-presentation-complete")
            guard !FileManager.default.fileExists(atPath: complete.path) else {
                return XCTFail("Stale completion marker")
            }
            let (model, member, conversation, directory) = try await fixture()
            defer { try? FileManager.default.removeItem(at: directory) }
            let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
            let previous = scene.windows.first(where: \.isKeyWindow)
            let window = UIWindow(windowScene: scene)
            window.rootViewController = UIHostingController(
                rootView: NavigationStack {
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
            XCTFail("Native meal presentation inspection did not finish")
        #else
            throw XCTSkip("Meal presentation inspection is forbidden on physical devices.")
        #endif
    }

    private func fixture() async throws -> (SessionModel, VerifiedMember, UUID, URL) {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let auth = FakeAuthentication(active: .init(userId: member.userId, accessToken: "token-A"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: UUID(), household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let current = UUID()
        let removed = UUID()
        let conversation = UUID()
        let start = try MealWeekStart("2026-09-28")
        let meal = PlannedMeal(
            entryId: current, date: try CivilDate("2026-09-29"), slot: .dinner,
            title: "Fixture supper", recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        let week = MealWeekSnapshot(
            version: 1, householdId: member.householdId, weekStart: start, revision: "2", entries: [meal])
        let mealHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            guard request.value(forHTTPHeaderField: "Authorization") == "Bearer token-A" else {
                throw NestAPIFailure.forbidden
            }
            let body: Data
            if request.url?.path == "/v1/meals/week" {
                body = try JSONEncoder().encode(week)
            } else {
                guard request.url?.path == "/v1/meals/planned-recipe" else { throw NestAPIFailure.invalid }
                let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
                guard let target = query.first(where: { $0.name == "entryId" })?.value.flatMap(UUID.init(uuidString:)),
                    query.first(where: { $0.name == "revision" })?.value == "2", [current, removed].contains(target)
                else { throw NestAPIFailure.conflict }
                body = try JSONEncoder().encode(
                    PlannedRecipeEnvelope(
                        version: 1, householdId: member.householdId,
                        weekStart: start, revision: "2", entry: target == current ? meal : nil, snapshot: nil))
            }
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let transcript = try transcript(member: member, conversation: conversation, current: current, removed: removed)
        let assistantHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            (transcript, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP),
            offline: try ChoreOfflineStore(url: directory.appendingPathComponent("fixture.sqlite")),
            mealAPI: MealAPI(http: mealHTTP), assistantAPI: AssistantAPI(http: assistantHTTP))
        await model.restore()
        guard model.status == .ready(member) else { throw NestAPIFailure.unavailable }
        return (model, member, conversation, directory)
    }

    private func transcript(member: VerifiedMember, conversation: UUID, current: UUID, removed: UUID) throws -> Data {
        let common: [String: Any] = [
            "version": 1, "actorId": member.userId.uuidString,
            "householdId": member.householdId.uuidString, "weekStart": "2026-09-28",
        ]
        let placed = part(
            "placeMeal",
            input: [
                "weekStart": "2026-09-28", "expectedRevision": "0",
                "date": "2026-09-29", "slot": "dinner", "title": "Fixture supper",
            ],
            receipt: common.merging([
                "operationId": UUID().uuidString, "entryId": current.uuidString,
                "date": "2026-09-29", "slot": "dinner", "revision": "1",
            ]) { _, new in new })
        let removedPart = part(
            "removeMeal", input: ["weekStart": "2026-09-28", "expectedRevision": "1", "entryId": removed.uuidString],
            receipt: common.merging([
                "operationId": UUID().uuidString, "entryId": removed.uuidString,
                "revision": "2", "removed": true, "skippedPreparationId": NSNull(),
            ]) { _, new in new })
        for result in [placed, removedPart] {
            let part = try JSONDecoder().decode(
                [String: AssistantJSON].self, from: JSONSerialization.data(withJSONObject: result))
            _ = try XCTUnwrap(AssistantMealActionLink.read(part, member: member))
        }
        return try JSONSerialization.data(withJSONObject: [
            "version": 1,
            "conversation": [
                "conversationId": conversation.uuidString, "revision": "1",
                "messages": [
                    ["id": "placed-fixture", "role": "assistant", "parts": [placed]],
                    ["id": "removed-fixture", "role": "assistant", "parts": [removedPart]],
                ],
            ],
        ])
    }

    private func part(_ tool: String, input: [String: Any], receipt: [String: Any]) -> [String: Any] {
        [
            "type": "tool-\(tool)", "toolCallId": tool, "state": "output-available", "input": input,
            "output": ["ok": true, "value": receipt],
        ]
    }
}
