import SwiftUI
import UIKit
import XCTest

@testable import Nest

/// Explicit read-only rendering inspection. Never hosted, provider or phone acceptance.
@MainActor
final class LegacyDismissalPresentationFixtureTests: XCTestCase {
    func testInspectRetainedDraftReviewsOnOwnedSimulator() async throws {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_TEST_DISMISSAL_PRESENTATION"] == "inspect" else {
                throw XCTSkip("Requires explicit retained-draft presentation inspection.")
            }
            guard environment["SIMULATOR_UDID"] == "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A" else {
                return XCTFail("Retained-draft inspection requires the owned clean simulator")
            }
            let complete = URL(filePath: "/private/tmp/nest-dismissal-presentation-complete")
            guard !FileManager.default.fileExists(atPath: complete.path) else {
                return XCTFail("Stale presentation completion marker")
            }
            let direct = try await LegacyDismissalTestFixture.make()
            let fixture = try await LegacyDismissalApprovalTestFixture.make()
            let directURL = direct.base.url
            let privateURL = fixture.base.base.url
            addTeardownBlock {
                try? FileManager.default.removeItem(at: directURL)
                try? FileManager.default.removeItem(at: privateURL)
            }
            let draft = await direct.server.draftId
            let approval = await fixture.server.approvalId
            let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
            let previous = scene.windows.first(where: \.isKeyWindow)
            let window = UIWindow(windowScene: scene)
            window.rootViewController = UIHostingController(
                rootView: reviews(direct: direct, privateFixture: fixture, draft: draft, approval: approval))
            window.makeKeyAndVisible()
            let previousHidden = previous?.isHidden
            previous?.isHidden = true
            defer {
                window.isHidden = true
                if let previousHidden { previous?.isHidden = previousHidden }
                previous?.makeKeyAndVisible()
                try? FileManager.default.removeItem(at: complete)
            }
            for _ in 0..<240 {
                if FileManager.default.fileExists(atPath: complete.path) {
                    let writes = await direct.server.writes
                    let cancellations = await direct.server.cancellationWrites
                    let decisions = await fixture.server.sends
                    XCTAssertEqual(writes, 0)
                    XCTAssertEqual(cancellations, 0)
                    XCTAssertEqual(decisions, 0)
                    return
                }
                try await Task.sleep(for: .seconds(1))
            }
            XCTFail("Retained-draft rendering inspection did not finish")
        #else
            throw XCTSkip("Retained-draft presentation inspection is forbidden on physical devices.")
        #endif
    }

    private func reviews(
        direct: LegacyDismissalTestFixture, privateFixture: LegacyDismissalApprovalTestFixture, draft: UUID,
        approval: UUID
    ) -> some View {
        NavigationStack {
            List {
                Text("Fictional read-only inspection. No hosted data or live AI.")
                NavigationLink("Direct draft review") {
                    LegacyDismissalScreen(session: direct.session, member: direct.base.member, draftId: draft)
                }
                NavigationLink("Private proposal review") {
                    LegacyDismissalApprovalScreen(
                        session: privateFixture.session, member: privateFixture.base.base.member, approvalId: approval)
                }
            }
            .navigationTitle("Retained draft QA")
            .scrollContentBackground(.hidden).background(QuietPalette.background)
        }
        .tint(QuietPalette.accent)
    }
}
