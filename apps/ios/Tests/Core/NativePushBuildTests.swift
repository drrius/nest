import XCTest

@testable import NestCore

final class NativePushBuildTests: XCTestCase {
    func testExplicitSigningEnvironmentNeverInfersFromDebugOrUnknownValues() {
        XCTAssertEqual(NativePushBuild(enabled: true, entitlement: "development"), .available(.sandbox))
        XCTAssertEqual(NativePushBuild(enabled: true, entitlement: "production"), .available(.production))
        for value in [nil, "", "sandbox", "DEBUG", "prod", "$(NEST_APNS_ENVIRONMENT)"] {
            XCTAssertEqual(NativePushBuild(enabled: true, entitlement: value), .signingMissing)
            XCTAssertEqual(NativePushBuild(enabled: false, entitlement: value), .disabled)
        }
    }
}
