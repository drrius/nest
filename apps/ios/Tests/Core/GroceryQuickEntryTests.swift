import XCTest

@testable import NestCore

final class GroceryQuickEntryTests: XCTestCase {
    func testSplitsQuantityAndUnit() {
        XCTAssertEqual(GroceryQuickEntry.parse("2 avocados"), GroceryQuickEntry(name: "avocados", quantity: "2"))
        XCTAssertEqual(
            GroceryQuickEntry.parse("500 g mince"), GroceryQuickEntry(name: "mince", quantity: "500", unit: "g"))
        XCTAssertEqual(
            GroceryQuickEntry.parse("1,5 L oat milk"), GroceryQuickEntry(name: "oat milk", quantity: "1,5", unit: "l"))
    }

    func testKeepsEverythingElseAsTheName() {
        XCTAssertEqual(GroceryQuickEntry.parse("  oat milk "), GroceryQuickEntry(name: "oat milk"))
        XCTAssertEqual(GroceryQuickEntry.parse("7up"), GroceryQuickEntry(name: "7up"))
        XCTAssertEqual(GroceryQuickEntry.parse("2"), GroceryQuickEntry(name: "2"))
        XCTAssertEqual(GroceryQuickEntry.parse("3 g"), GroceryQuickEntry(name: "g", quantity: "3"))
        XCTAssertNil(GroceryQuickEntry.parse("   "))
    }

    /// Property: parsing never drops a typed word.
    func testParsingKeepsEveryWord() {
        let samples = ["2 avocados", "500 g mince", "bananas", "4 tins chopped tomatoes", "1 bunch basil", "x 2"]
        for sample in samples {
            guard let entry = GroceryQuickEntry.parse(sample) else { return XCTFail(sample) }
            let rebuilt = [entry.quantity, entry.unit, entry.name].compactMap { $0 }.joined(separator: " ")
            XCTAssertEqual(rebuilt.lowercased(), sample.lowercased(), sample)
        }
    }
}
