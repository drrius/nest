import Foundation
import XCTest

@testable import Nest

@MainActor
final class PushDelegateCompletionTests: XCTestCase {
    func testBackgroundResponseCallbackCompletesOnceOnMainThreadAfterRouting() async throws {
        let delegate = PushApplicationDelegate()
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        delegate.inbox.bind(member)
        let data = try JSONSerialization.data(withJSONObject: [
            "version": 1, "kind": "renewal", "householdId": member.householdId.uuidString,
            "renewalId": UUID().uuidString,
        ])
        let completed = expectation(description: "UIKit completion on main thread")
        completed.assertForOverFulfill = true
        await Task.detached {
            delegate.finishResponse(data: data) {
                XCTAssertTrue(Thread.isMainThread)
                completed.fulfill()
            }
        }.value
        await fulfillment(of: [completed], timeout: 2)
        XCTAssertEqual(delegate.inbox.pending, try NestPushDestination.decode(data))
    }

    func testIgnoredAndMalformedResponsesStillCompleteOnceOnMainThread() async {
        let delegate = PushApplicationDelegate()
        for data in [nil, Data("invalid".utf8)] {
            let completed = expectation(description: "Ignored notification completion")
            completed.assertForOverFulfill = true
            await Task.detached {
                delegate.finishResponse(data: data) {
                    XCTAssertTrue(Thread.isMainThread)
                    completed.fulfill()
                }
            }.value
            await fulfillment(of: [completed], timeout: 2)
            XCTAssertNil(delegate.inbox.pending)
        }
    }
}
