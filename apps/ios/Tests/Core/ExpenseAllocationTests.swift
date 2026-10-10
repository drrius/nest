import Foundation
import XCTest

@testable import NestCore

final class ExpenseAllocationTests: XCTestCase {
    func testInputParsingPreservesCentimesAndRejectsAmbiguity() throws {
        XCTAssertEqual(try ExpenseSplit.parseCHF(" 1,01 ").value, 101)
        XCTAssertEqual(try ExpenseSplit.parseCHF("90071992547409.91").value, 9_007_199_254_740_991)
        for input in ["-1", "1.001", "1,000.00", "1e3", "", ".5", "90071992547409.92"] {
            XCTAssertThrowsError(try ExpenseSplit.parseCHF(input), input)
        }
    }

    func testSplitsConserveAtLimitsAndGiveHalfCentToPayer() throws {
        let payer = UUID()
        let other = UUID()
        for amount in [Int64(0), 1, 101, 9999, 10000, 9_007_199_254_740_991] {
            for points in stride(from: 0, through: 10000, by: 25) {
                let split = try ExpenseSplit.percentage(
                    Centimes(String(amount)), payer: payer, other: other, payerBasisPoints: points)
                XCTAssertEqual(split[0].centimes.value + split[1].centimes.value, amount)
                XCTAssertGreaterThanOrEqual(split[0].centimes.value, 0)
                XCTAssertGreaterThanOrEqual(split[1].centimes.value, 0)
                let expectedOther = (Decimal(amount) * Decimal(10000 - points) / 10000)
                XCTAssertLessThanOrEqual(abs(Decimal(split[1].centimes.value) - expectedOther), Decimal(string: "0.5")!)
            }
        }
        let equal = try ExpenseSplit.equal(Centimes("101"), payer: payer, other: other)
        XCTAssertEqual(equal.map(\.centimes.value), [51, 50])
        XCTAssertThrowsError(try ExpenseSplit.equal(Centimes("1"), payer: payer, other: payer))
        XCTAssertThrowsError(
            try ExpenseSplit.percentage(Centimes("1"), payer: payer, other: other, payerBasisPoints: 10001))
        XCTAssertEqual(
            try ExpenseSplit.exact(Centimes("101"), members: [other, payer], shares: equal).map(\.memberId),
            [other, payer])
        XCTAssertThrowsError(try ExpenseSplit.exact(Centimes("102"), members: [payer, other], shares: equal))
    }
}
