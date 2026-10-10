import Foundation
import XCTest

@testable import Nest

@MainActor
final class MemberColourModelTests: XCTestCase {
    private let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
    private let partner = UUID()
    private var suite = ""

    override func setUp() {
        suite = "member-colours-\(UUID())"
    }

    override func tearDown() {
        UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite)
    }

    private func envelope(_ choices: [UUID: (MemberColor, String)]) -> MemberColoursEnvelope {
        MemberColoursEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            colours: choices.map { MemberColourChoice(actorId: $0.key, colour: $0.value.0, revision: $0.value.1) })
    }

    private func receipt(_ colour: MemberColor, revision: String) -> MemberColourReceipt {
        MemberColourReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: UUID(), revision: revision,
            colour: colour)
    }

    private func model(
        read: @escaping @MainActor () async throws -> MemberColoursEnvelope,
        save: @escaping @MainActor (MemberColor, String) async throws -> MemberColourReceipt
    ) throws -> MemberColourModel {
        MemberColourModel(
            member: member, sync: MemberColourSync(read: read, save: save),
            defaults: try XCTUnwrap(UserDefaults(suiteName: suite)))
    }

    func testRefreshShowsBothColoursAndSavesWithTheCurrentRevision() async throws {
        var expected: [String] = []
        let colours = try model(
            read: { self.envelope([self.member.userId: (.plum, "4"), self.partner: (.teal, "1")]) },
            save: { colour, revision in
                expected.append(revision)
                return self.receipt(colour, revision: "5")
            })
        await colours.refresh()
        XCTAssertEqual(colours.choice, .plum)
        let shown = colours.palette(members: [NestMember(actorId: partner, displayName: "Leah")])
        XCTAssertEqual(shown.color(partner), .teal)
        await colours.choose(.rose)?.value
        XCTAssertEqual(colours.choice, .rose)
        XCTAssertEqual(expected, ["4"])
        XCTAssertNil(colours.notice)
        let relaunched = try model(
            read: { throw NestAPIFailure.unavailable }, save: { _, _ in throw NestAPIFailure.unavailable })
        XCTAssertEqual(relaunched.choice, .rose, "The last saved colours are cached for launch")
        XCTAssertEqual(relaunched.choices[partner], .teal)
    }

    func testAColourYourPartnerJustTookRollsBackAndSaysSo() async throws {
        var partnerColour = MemberColor.teal
        let colours = try model(
            read: { self.envelope([self.partner: (partnerColour, "2")]) },
            save: { _, _ in throw NestAPIFailure.conflict })
        await colours.refresh()
        partnerColour = .indigo
        let task = colours.choose(.indigo)
        XCTAssertEqual(colours.choice, .indigo, "The choice shows immediately")
        XCTAssertTrue(colours.saving)
        await task?.value
        XCTAssertNil(colours.choice)
        XCTAssertEqual(colours.choices[partner], .indigo)
        XCTAssertEqual(colours.notice, .taken)
        XCTAssertFalse(colours.saving)
    }

    func testOfflineSavesRollBackWithoutClaimingAChange() async throws {
        let colours = try model(
            read: { self.envelope([self.member.userId: (.clay, "1")]) },
            save: { _, _ in throw NestAPIFailure.unavailable })
        await colours.refresh()
        await colours.choose(.slate)?.value
        XCTAssertEqual(colours.choice, .clay)
        XCTAssertEqual(colours.notice, .failed)
        XCTAssertNil(colours.choose(.clay), "Choosing the current colour does nothing")
    }
}
