import UIKit
import XCTest

@testable import Nest

@MainActor
final class NotificationPresentationTests: XCTestCase {
    func testExistingSheetMustFinishDismissalBeforeNotificationCanOpen() async throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let root = UIViewController()
        window.rootViewController = root
        window.isHidden = false
        defer { window.isHidden = true }
        let availability = NotificationPresentationAvailability()
        availability.view = root.view
        XCTAssertTrue(availability.canPresent)
        let form = UIViewController()
        await withCheckedContinuation { continuation in
            root.present(form, animated: false) { continuation.resume() }
        }
        XCTAssertFalse(availability.canPresent, "Notification must preserve the presented form")
        XCTAssertTrue(root.presentedViewController === form)
        await withCheckedContinuation { continuation in
            root.dismiss(animated: false) { continuation.resume() }
        }
        XCTAssertTrue(availability.canPresent)
    }

    func testDisconnectedWindowCannotConsumeQueuedNotification() {
        let availability = NotificationPresentationAvailability()
        XCTAssertFalse(availability.canPresent)
        let view = UIView()
        availability.view = view
        XCTAssertFalse(availability.canPresent)
    }
}
