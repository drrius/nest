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

    func testARefreshThatStartedBeforeASaveCannotUndoIt() async throws {
        var reads = 0
        var release: CheckedContinuation<Void, Never>?
        var expected: [String] = []
        let colours = try model(
            read: {
                reads += 1
                if reads == 2 { await withCheckedContinuation { release = $0 } }
                return self.envelope([self.member.userId: (.plum, "1")])
            },
            save: { colour, revision in
                expected.append(revision)
                return self.receipt(colour, revision: String(Int(revision)! + 1))
            })
        await colours.refresh()
        let stale = Task { await colours.refresh() }
        while release == nil { await Task.yield() }
        await colours.choose(.rose)?.value
        release?.resume()
        await stale.value
        XCTAssertEqual(colours.choice, .rose, "The older read lands after the save and is ignored")
        await colours.choose(.slate)?.value
        XCTAssertEqual(expected, ["1", "2"], "The next save uses the saved revision, not the stale one")
    }

    func testOverlappingRefreshesKeepTheNewestRead() async throws {
        var reads = 0
        var release: CheckedContinuation<Void, Never>?
        var expected: [String] = []
        let colours = try model(
            read: {
                reads += 1
                guard reads == 1 else { return self.envelope([self.member.userId: (.rose, "2")]) }
                await withCheckedContinuation { release = $0 }
                return self.envelope([self.member.userId: (.plum, "1")])
            },
            save: { colour, revision in
                expected.append(revision)
                return self.receipt(colour, revision: "3")
            })
        let older = Task { await colours.refresh() }
        while release == nil { await Task.yield() }
        await colours.refresh()
        release?.resume()
        await older.value
        XCTAssertEqual(colours.choice, .rose, "The read that started first and landed last is ignored")
        await colours.choose(.slate)?.value
        XCTAssertEqual(expected, ["2"])
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

    func testASaveWhoseResponseWasLostIsConfirmedByTheNextRead() async throws {
        var saved: MemberColor?
        let colours = try model(
            read: { self.envelope([self.member.userId: (saved ?? .clay, saved == nil ? "1" : "2")]) },
            save: { colour, _ in
                saved = colour
                throw NestAPIFailure.unavailable
            })
        await colours.refresh()
        await colours.choose(.teal)?.value
        XCTAssertEqual(colours.choice, .teal)
        XCTAssertNil(colours.notice, "The save landed, so nothing failed")
    }

    func testThePaletteKnowsYourPartnerBeforeTodayLoads() async throws {
        let colours = try model(
            read: { self.envelope([self.partner: (.teal, "1")]) },
            save: { _, _ in throw NestAPIFailure.unavailable })
        await colours.refresh()
        let palette = colours.palette(members: [])
        XCTAssertEqual(palette.partner, partner)
        XCTAssertEqual(palette.color(partner), .teal, "The picker can mark Teal as taken")
    }

    func testAFailureSettlingLateLeavesANewerChoiceAlone() async throws {
        var reads = 0
        var release: CheckedContinuation<Void, Never>?
        var saves = 0
        let colours = try model(
            read: {
                reads += 1
                if reads == 2 { await withCheckedContinuation { release = $0 } }
                return self.envelope([self.member.userId: (.clay, "1")])
            },
            save: { colour, _ in
                saves += 1
                if saves == 1 { throw NestAPIFailure.unavailable }
                return self.receipt(colour, revision: "2")
            })
        await colours.refresh()
        let failing = colours.choose(.slate)
        while release == nil { await Task.yield() }
        await colours.choose(.rose)?.value
        release?.resume()
        await failing?.value
        XCTAssertEqual(colours.choice, .rose)
        XCTAssertNil(colours.notice, "The older failure must not report on the newer save")
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
