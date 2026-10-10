import Foundation
import XCTest

@testable import NestCore

final class MemberColorTests: XCTestCase {
    func testDefaultsAgreeOnBothPhonesAndDiffer() {
        let a = UUID(uuidString: "00000000-0000-0000-0000-00000000000A")!
        let b = UUID(uuidString: "00000000-0000-0000-0000-00000000000B")!
        let first = MemberColorAssignment.resolve(members: [a, b], choices: [:])
        let second = MemberColorAssignment.resolve(members: [b, a], choices: [:])
        XCTAssertEqual(first, second)
        XCTAssertEqual(first[a], .lake)
        XCTAssertEqual(first[b], .clay)
    }

    func testOwnChoiceWinsAndPartnerMovesOffACollision() {
        let a = UUID(uuidString: "00000000-0000-0000-0000-00000000000A")!
        let b = UUID(uuidString: "00000000-0000-0000-0000-00000000000B")!
        let result = MemberColorAssignment.resolve(members: [a, b], choices: [a: .clay])
        XCTAssertEqual(result[a], .clay)
        XCTAssertNotEqual(result[b], .clay)
        XCTAssertFalse(MemberColorAssignment.available(for: b, in: result).contains(.clay))
    }

    /// Property: any members and any choices always produce distinct colours, honouring the first valid choice.
    func testAssignmentsAreAlwaysDistinct() {
        var generator = SystemRandomNumberGenerator()
        for _ in 0..<2_000 {
            let members = (0..<Int.random(in: 0...2, using: &generator)).map { _ in UUID() }
            var choices: [UUID: MemberColor] = [:]
            for id in members where Bool.random(using: &generator) {
                choices[id] = MemberColor.allCases.randomElement(using: &generator)
            }
            let result = MemberColorAssignment.resolve(members: members, choices: choices)
            XCTAssertEqual(Set(result.keys), Set(members))
            XCTAssertEqual(Set(result.values).count, result.count)
            let honoured = members.filter { choices[$0] != nil && result[$0] == choices[$0] }
            XCTAssertTrue(
                Set(choices.values).count < choices.count || honoured.count == choices.count,
                "distinct choices must all be honoured")
        }
    }

    func testMealEmojiPrefersSpecificDishes() {
        XCTAssertEqual(MealEmoji.emoji(for: "Moitié-moitié fondue"), "🫕")
        XCTAssertEqual(MealEmoji.emoji(for: "Lemon chicken & couscous"), "🍗")
        XCTAssertEqual(MealEmoji.emoji(for: "Roasted tomato pasta"), "🍝")
        XCTAssertEqual(MealEmoji.emoji(for: "Chicken curry"), "🍛")
        XCTAssertEqual(MealEmoji.emoji(for: "Crispy fish tacos"), "🌮")
        XCTAssertEqual(MealEmoji.emoji(for: "Leftover pizza"), "🥡")
        XCTAssertEqual(MealEmoji.emoji(for: "CRÊPES"), "🥞")
        XCTAssertEqual(MealEmoji.emoji(for: "Something new"), MealEmoji.fallback)
    }
}
