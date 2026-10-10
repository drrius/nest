import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedManualIngredientReviewTests: XCTestCase {
    private let entry = UUID(uuidString: "F040105F-89B5-4370-AA2F-636C7C284BE1")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!

    func testBothMembersReadOwnedIngredientsAndCanonicalGrocery() async throws {
        let (actor, name, phase) = try fixture()
        let configuration = try NestConfiguration.fromBundle()
        guard configuration.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            configuration.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co",
            !configuration.pushEnabled
        else { throw ManualWeekReadFailure.configuration }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        do {
            let offline = try ChoreOfflineStore(url: directory.appendingPathComponent("ingredient-read.sqlite"))
            let auth = try NestAuth(configuration: configuration, offline: offline)
            let session = try await auth.session()
            guard session.userId == actor else { throw ManualWeekReadFailure.configuration }
            let http = try NestHTTP(baseURL: configuration.apiURL)
            let member = try await ChoreAPI(http: http).verify(token: session.accessToken, expectedActor: actor)
            guard member.householdId == household, member.displayName == name else {
                throw ManualWeekReadFailure.configuration
            }
            let api = MealAPI(http: http)
            let week = try await api.week(
                token: session.accessToken, member: member, start: MealWeekStart("2026-10-19"))
            XCTAssertEqual(week.revision, "9")
            XCTAssertEqual(week.entries.count, 7)
            let listing = try await api.allIngredients(
                token: session.accessToken, member: member, week: week.weekStart, revision: week.revision)
            verify(listing, phase: phase)
            let groceries = try await GroceryAPI(http: http).list(token: session.accessToken, member: member)
            let owned = groceries.groceries.filter { $0.mealSource?.entryId == entry }
            verify(owned, listing: listing, phase: phase)
            try record(member: member, listing: listing, groceries: owned, phase: phase)
        } catch { throw ManualWeekReadFailure.read }
    }

    private func verify(_ listing: MealIngredientListing, phase: String) {
        XCTAssertTrue(listing.complete)
        XCTAssertNil(listing.nextAfter)
        XCTAssertEqual(listing.ingredients.count, 2)
        XCTAssertEqual(listing.skipped.count, 6)
        XCTAssertTrue(listing.skipped.allSatisfy { $0.reason == .noRecipe && $0.entryId != entry })
        let rows = listing.ingredients.sorted { $0.name < $1.name }
        XCTAssertEqual(rows.map(\.name), ["QA lentils", "QA rice"])
        XCTAssertEqual(rows.map(\.quantity), ["200", "100"])
        XCTAssertEqual(rows.map(\.unit), ["g", "g"])
        XCTAssertTrue(
            rows.allSatisfy {
                $0.entryId == entry && $0.date.value == "2026-10-19" && $0.slot == .dinner
                    && $0.mealTitle == "Nest native manual week 20261005"
            })
        XCTAssertNil(rows.first?.groceryItemId, "Pantry lentils remain excluded")
        if phase == "before" {
            XCTAssertNil(rows.last?.groceryItemId)
        } else {
            XCTAssertNotNil(rows.last?.groceryItemId)
        }
    }

    private func verify(_ groceries: [GroceryItem], listing: MealIngredientListing, phase: String) {
        if phase == "before" {
            XCTAssertTrue(groceries.isEmpty)
            return
        }
        XCTAssertEqual(groceries.count, 1)
        let rice = groceries.first
        XCTAssertEqual(rice?.name, "QA rice")
        XCTAssertEqual(rice?.quantity, "100")
        XCTAssertEqual(rice?.unit, "g")
        XCTAssertEqual(rice?.checked, false)
        XCTAssertEqual(rice?.legacyClaimed, false)
        XCTAssertEqual(rice?.mealSource?.date?.value, "2026-10-19")
        XCTAssertEqual(rice?.mealSource?.slot, "dinner")
        XCTAssertEqual(rice?.itemId, listing.ingredients.first { $0.name == "QA rice" }?.groceryItemId)
    }

    private func record(
        member: VerifiedMember, listing: MealIngredientListing, groceries: [GroceryItem], phase: String
    ) throws {
        let encoder = JSONEncoder()
        let report: [String: Any] = [
            "actor": member.userId.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "phase": phase, "revision": listing.revision,
            "ingredients": try JSONSerialization.jsonObject(with: encoder.encode(listing.ingredients)),
            "skipped": try JSONSerialization.jsonObject(with: encoder.encode(listing.skipped)),
            "groceries": try JSONSerialization.jsonObject(with: encoder.encode(groceries)),
        ]
        let capture = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        capture.name = "Owned native ingredient and grocery readback"
        capture.lifetime = .keepAlways
        add(capture)
    }

    private func fixture() throws -> (UUID, String, String) {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_QA_NATIVE_INGREDIENT_READ"] == "20261005" else {
                throw XCTSkip("Requires explicit read-only verification of owned native ingredients.")
            }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (
                    UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!, "Test Alex"
                ),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (
                    UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!, "Test Sam"
                ),
            ]
            let role = try XCTUnwrap(roles[try XCTUnwrap(environment["SIMULATOR_UDID"])])
            let phase = try XCTUnwrap(environment["NEST_QA_INGREDIENT_PHASE"])
            XCTAssertTrue(["before", "after"].contains(phase))
            XCTAssertEqual(environment["NEST_QA_MANUAL_WEEK_NAME"], role.1)
            return (role.0, role.1, phase)
        #else
            throw XCTSkip("Fictional native ingredient fixtures are forbidden on physical phones.")
        #endif
    }
}
