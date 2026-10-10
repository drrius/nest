import SwiftUI
import UIKit
import XCTest

@testable import Nest

/// Opted-in form inspection with fictional transport; never phone or hosted acceptance.
@MainActor
final class LegacyAdoptionPresentationFixtureTests: XCTestCase {
    func testInspectNewMandateReviewOnOwnedSimulator() async throws {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_TEST_ADOPTION_PRESENTATION"] == "inspect" else {
                throw XCTSkip("Requires explicit rule adoption form inspection.")
            }
            guard environment["SIMULATOR_UDID"] == "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A" else {
                return XCTFail("Rule adoption inspection requires the owned clean simulator")
            }
            let complete = URL(filePath: "/private/tmp/nest-adoption-presentation-complete")
            guard !FileManager.default.fileExists(atPath: complete.path) else {
                return XCTFail("Stale presentation completion marker")
            }
            let fixture = try await LegacyAdoptionTestFixture.make()
            let storage = fixture.base.url
            addTeardownBlock { try? FileManager.default.removeItem(at: storage) }
            let rule = await fixture.server.ruleId
            let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
            let previous = scene.windows.first(where: \.isKeyWindow)
            let window = UIWindow(windowScene: scene)
            window.rootViewController = UIHostingController(rootView: form(fixture, rule: rule))
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
                    let writes = await fixture.server.writes
                    let cancellations = await fixture.server.cancellationWrites
                    XCTAssertEqual(writes, 0)
                    XCTAssertEqual(cancellations, 0)
                    let context = try fixture.session.expenseContext()
                    let pending = try await fixture.session.savedLegacyAdoption(context)
                    XCTAssertNil(pending)
                    return
                }
                try await Task.sleep(for: .seconds(1))
            }
            XCTFail("Rule adoption form inspection did not finish")
        #else
            throw XCTSkip("Rule adoption inspection is forbidden on physical devices.")
        #endif
    }

    func testInspectPrivateMandateProposalOnOwnedSimulator() async throws {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_TEST_ADOPTION_APPROVAL_PRESENTATION"] == "inspect" else {
                throw XCTSkip("Requires explicit rule adoption form inspection.")
            }
            guard environment["SIMULATOR_UDID"] == "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A" else {
                return XCTFail("Rule adoption inspection requires the owned clean simulator")
            }
            let complete = URL(filePath: "/private/tmp/nest-adoption-approval-presentation-complete")
            guard !FileManager.default.fileExists(atPath: complete.path) else {
                return XCTFail("Stale presentation completion marker")
            }
            let fixture = try await LegacyAdoptionApprovalTestFixture.make()
            let storage = fixture.base.base.url
            addTeardownBlock { try? FileManager.default.removeItem(at: storage) }
            let approval = await fixture.server.approvalId
            let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
            let previous = scene.windows.first(where: \.isKeyWindow)
            let window = UIWindow(windowScene: scene)
            window.rootViewController = UIHostingController(rootView: privateProposal(fixture, approval: approval))
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
                    let writes = await fixture.server.postings
                    let cancellations = await fixture.server.sends
                    XCTAssertEqual(writes, 0)
                    XCTAssertEqual(cancellations, 0)
                    let context = try fixture.session.expenseContext()
                    let pending = try await fixture.session.savedLegacyAdoptionDecision(context)
                    XCTAssertNil(pending)
                    return
                }
                try await Task.sleep(for: .seconds(1))
            }
            XCTFail("Rule adoption form inspection did not finish")
        #else
            throw XCTSkip("Rule adoption inspection is forbidden on physical devices.")
        #endif
    }

    private func form(_ fixture: LegacyAdoptionTestFixture, rule: UUID) -> some View {
        NavigationStack {
            LegacyAdoptionScreen(session: fixture.session, member: fixture.base.member, ruleId: rule)
        }
        .tint(QuietPalette.accent)
    }
    private func privateProposal(_ fixture: LegacyAdoptionApprovalTestFixture, approval: UUID) -> some View {
        NavigationStack {
            LegacyAdoptionApprovalScreen(
                session: fixture.session, member: fixture.base.base.member, approvalId: approval)
        }
        .tint(QuietPalette.accent)
    }

}
