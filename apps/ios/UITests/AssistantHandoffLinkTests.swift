import XCTest

@MainActor
final class AssistantHandoffLinkTests: XCTestCase {
    private let conversation = "4e809372-f12d-4004-afd3-9a502e98de23"
    private let correctedConversation = "4c528a2f-42a3-4e3d-a909-5a0ff7f106da"
    private let scrollbarConversation = "10b77a97-1709-4799-9b17-8cb3a613d402"
    private let week = "2026-10-19"
    private let links = [
        "Open Calendar", "Review busy sharing", "Review ingredients",
        "Review notifications", "Review your setup", "Open Profile",
    ]

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testNormalHonestDeviceHandoffsOpenTheirNativeDestinations() throws {
        try journey(mode: "normal_light")
    }

    func testMaximumHonestDeviceHandoffsOpenTheirNativeDestinations() throws {
        try journey(mode: "maximum_dark")
    }

    func testMaximumHandoffDestinationsRemainReadableAcrossScrolling() throws {
        try journey(mode: "maximum_dark_corrected", conversationId: correctedConversation)
    }

    func testNormalHandoffLabelsCaptureTheirVisibleAccentForeground() throws {
        try requireFixture(mode: "normal_light_capture", conversationId: correctedConversation)
        let app = openOwnerHistory()
        let row = app.buttons["assistant-conversation-\(correctedConversation)"]
        reveal(row, in: app)
        requireTarget(row, in: app)
        XCTAssertTrue(viewport(in: app).contains(row.frame))
        row.tap()
        XCTAssertTrue(app.navigationBars["Conversation"].waitForExistence(timeout: 20))
        for label in links {
            let candidates = app.buttons.matching(NSPredicate(format: "label == %@", label))
            reveal(candidates.firstMatch, in: app)
            XCTAssertEqual(candidates.count, 1)
            let link = candidates.firstMatch
            requireTarget(link, in: app)
            XCTAssertTrue(viewport(in: app).contains(link.frame))
            capture(link, name: "Normal accent handoff label capture only \(label)", in: app)
        }
        let back = app.navigationBars["Conversation"].buttons.element(boundBy: 0)
        requireTarget(back, in: app)
        back.tap()
        XCTAssertTrue(app.navigationBars["Ask Nest"].waitForExistence(timeout: 15))
        let close = app.navigationBars["Ask Nest"].buttons.element(boundBy: 0)
        requireTarget(close, in: app)
        close.tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
    }

    func testMaximumHandoffTranscriptPansAvoidTheScrollIndicator() throws {
        try journey(mode: "maximum_dark_left_padding", conversationId: scrollbarConversation)
    }

    private func journey(mode: String, conversationId: String? = nil) throws {
        let currentConversation = conversationId ?? conversation
        try requireFixture(mode: mode, conversationId: currentConversation)
        let app = openOwnerHistory()
        let row = app.buttons["assistant-conversation-\(currentConversation)"]
        reveal(row, in: app)
        requireTarget(row, in: app)
        XCTAssertTrue(viewport(in: app).contains(row.frame))
        row.tap()
        XCTAssertTrue(app.navigationBars["Conversation"].waitForExistence(timeout: 20))
        read("Only you can see this chat", in: app)
        var calendarNotRequested = false
        for label in links {
            let candidates = app.buttons.matching(NSPredicate(format: "label == %@", label))
            reveal(candidates.firstMatch, in: app)
            XCTAssertEqual(candidates.count, 1, "Only the exact synthetic handoff is permitted")
            let link = candidates.firstMatch
            capture(link, name: "Honest handoff target \(label)", in: app)
            requireTarget(link, in: app)
            if label == "Review busy sharing" && !busySharingSafe(calendarNotRequested) {
                attach(
                    ["link": label, "opened": false, "reason": "Permission-loss cleanup preconditions unsafe"],
                    name: "Busy-sharing handoff measured but not opened")
                continue
            }
            XCTAssertTrue(viewport(in: app).contains(link.frame))
            link.tap()
            assertDestination(label, in: app)
            capture(app.navigationBars.firstMatch, name: "Opened real native destination \(label)", in: app)
            attach(["link": label, "opened": true, "domainMutationInvoked": false], name: "Native handoff opened")
            if label == "Open Calendar" {
                calendarNotRequested = establishUnrequestedCalendar(in: app)
            }
            let back = app.navigationBars.firstMatch.buttons.element(boundBy: 0)
            requireTarget(back, in: app)
            back.tap()
            XCTAssertTrue(app.navigationBars["Conversation"].waitForExistence(timeout: 15))
        }
        capture(app.navigationBars["Conversation"], name: "Returned unchanged synthetic handoff transcript", in: app)
        let back = app.navigationBars["Conversation"].buttons.element(boundBy: 0)
        requireTarget(back, in: app)
        back.tap()
        XCTAssertTrue(app.navigationBars["Ask Nest"].waitForExistence(timeout: 15))
        let close = app.navigationBars["Ask Nest"].buttons.element(boundBy: 0)
        requireTarget(close, in: app)
        close.tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        capture(app.buttons["Me + shared"], name: "Original Today after six read-only handoffs", in: app)
    }

    private func requireFixture(mode: String, conversationId: String) throws {
        _ = try NativeMealWeekFixture(action: "assistant_device_handoffs")
        let values = ProcessInfo.processInfo.environment
        guard values["NEST_QA_ASSISTANT_HANDOFFS"] == "20261006" else {
            throw XCTSkip("Requires the explicitly prepared fictional device-handoff conversation.")
        }
        _ = try XCTUnwrap(UUID(uuidString: conversationId), "Root must pin the exact fixture before any execution")
        XCTAssertEqual(values["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        XCTAssertEqual(values["NEST_QA_MANUAL_WEEK_NAME"], "Test Alex")
        XCTAssertEqual(values["NEST_QA_ASSISTANT_HANDOFF_CONVERSATION"], conversationId)
        XCTAssertEqual(values["NEST_QA_ASSISTANT_HANDOFF_MODE"], mode)
        XCTAssertEqual(values["NEST_QA_ASSISTANT_HANDOFF_WEEK"], week)
        XCTAssertEqual(values["NEST_QA_ASSISTANT_HANDOFF_ACTOR"], "791f7261-6c9d-4061-9c8a-57aa6e0b0200")
        XCTAssertEqual(values["NEST_QA_ASSISTANT_HANDOFF_HOUSEHOLD"], "be772ffd-3ab5-41d5-8438-647a79a553da")
        XCTAssertEqual(values["NEST_QA_POSITIVE_BUDGET"], "0")
        XCTAssertEqual(values["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
        XCTAssertEqual(values["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
        XCTAssertEqual(values["NEST_QA_PUSH_ENABLED"], "false")
    }

    private func busySharingSafe(_ calendarNotRequested: Bool) -> Bool {
        calendarNotRequested
            && ProcessInfo.processInfo.environment["NEST_QA_HANDOFF_PRIVACY_REMOVAL_ABSENT"] == "true"
    }

    private func openOwnerHistory() -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        let profile = app.buttons["tab-profile-action"]
        requireTarget(profile, in: app)
        profile.tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 20))
        let back = app.navigationBars.firstMatch.buttons.element(boundBy: 0)
        requireTarget(back, in: app)
        back.tap()
        let history = app.tabBars.buttons["Ask Nest"]
        requireTarget(history, in: app)
        history.tap()
        XCTAssertTrue(app.navigationBars["Ask Nest"].waitForExistence(timeout: 20))
        return app
    }

    private func assertDestination(_ label: String, in app: XCUIApplication) {
        switch label {
        case "Open Calendar":
            let header = app.navigationBars["Calendar"]
            reveal(header, in: app)
            XCTAssertTrue(header.exists && viewport(in: app).contains(header.frame))
            read("Choose day", in: app)
        case "Review busy sharing":
            XCTAssertTrue(app.navigationBars["Busy sharing"].waitForExistence(timeout: 20))
            read("Busy sharing is off", in: app)
            read("Allow calendar access in Calendar before enabling sharing.", in: app)
            XCTAssertFalse(app.buttons["Retry removal"].exists)
            XCTAssertFalse(app.buttons["Retry saved change"].exists)
        case "Review ingredients":
            XCTAssertTrue(app.navigationBars["Review ingredients"].waitForExistence(timeout: 20))
            read("What do you need?", in: app)
            read("Untick anything you already have. The rest goes on the shared list.", in: app)
        case "Review notifications":
            XCTAssertTrue(app.navigationBars["Notifications"].waitForExistence(timeout: 20))
            read("Choose what Nest may send to you. Your partner has separate choices.", in: app)
            read("Saving these choices does not grant iPhone notification permission.", in: app)
        case "Review your setup":
            XCTAssertTrue(app.navigationBars["Your setup"].waitForExistence(timeout: 20))
            read("Your meals", in: app)
        case "Open Profile":
            XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 20))
            read("Test Alex", in: app)
            read("Nest household with", in: app)
        default:
            XCTFail("Unapproved handoff destination")
        }
    }

    private func read(_ label: String, in app: XCUIApplication) {
        let target = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
        reveal(target, permitsTallText: true, in: app)
        XCTAssertTrue(target.exists, "Required native destination value: \(label)")
        if target.frame.height > viewport(in: app).height {
            XCTAssertEqual(target.elementType, .staticText, "Only noninteractive text may use scrolling coverage")
            readAcrossScrolling(target, in: app)
        } else {
            XCTAssertTrue(viewport(in: app).contains(target.frame), "Complete native value must be visible: \(label)")
        }
    }

    private func requireTarget(_ target: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(target.exists && target.isEnabled && target.isHittable)
        XCTAssertTrue(app.frame.contains(target.frame))
        XCTAssertGreaterThanOrEqual(target.frame.width, 44 - 1e-9)
        XCTAssertGreaterThanOrEqual(target.frame.height, 44 - 1e-9)
    }

    private func viewport(in app: XCUIApplication) -> CGRect {
        let navigation = app.navigationBars.firstMatch
        let top = navigation.exists ? navigation.frame.maxY : app.frame.minY
        let bottom = app.tabBars.firstMatch.frame.minY
        return CGRect(x: app.frame.minX, y: top, width: app.frame.width, height: bottom - top)
    }

    private func reveal(_ target: XCUIElement, permitsTallText: Bool = false, in app: XCUIApplication) {
        for attempt in 0..<24 {
            let bounds = viewport(in: app)
            let frame = target.exists ? target.frame : .zero
            if target.exists && permitsTallText && target.elementType == .staticText && frame.height > bounds.height {
                return
            }
            if target.exists && !frame.isEmpty && bounds.contains(frame) { return }
            let distance = frame.isEmpty ? 250 : max(-180, min(250, frame.midY - bounds.midY))
            dragReading(target, distance: distance, attempt: attempt, in: app)
        }
        capture(target, name: "Required handoff target remained outside viewport", in: app)
        XCTFail("Required native handoff target is not fully visible")
    }

    private func readAcrossScrolling(_ target: XCUIElement, in app: XCUIApplication) {
        let first = revealBoundary(target, start: true, in: app)
        let firstViewport = viewport(in: app)
        XCTAssertGreaterThanOrEqual(first.minY, firstViewport.minY)
        capture(target, name: "Long noninteractive explanation beginning", in: app)
        let last = revealBoundary(target, start: false, in: app)
        let lastViewport = viewport(in: app)
        XCTAssertLessThanOrEqual(last.maxY, lastViewport.maxY)
        capture(target, name: "Long noninteractive explanation ending", in: app)
        XCTAssertEqual(first.height, last.height, accuracy: 0.5)
        let firstCovered = min(first.height, firstViewport.maxY - first.minY)
        let lastCovered = min(last.height, last.maxY - lastViewport.minY)
        let overlap = firstCovered + lastCovered - first.height
        XCTAssertGreaterThan(firstCovered, 0)
        XCTAssertGreaterThan(lastCovered, 0)
        XCTAssertGreaterThan(overlap, 0, "Beginning/end coverage must overlap and leave no unread gap")
        attach(
            [
                "label": target.label, "first": values(first), "last": values(last),
                "firstViewport": values(firstViewport), "lastViewport": values(lastViewport),
                "firstCovered": firstCovered, "lastCovered": lastCovered, "overlap": overlap,
            ],
            name: "Continuous noninteractive explanation coverage")
    }

    private func revealBoundary(_ target: XCUIElement, start: Bool, in app: XCUIApplication) -> CGRect {
        for attempt in 0..<24 {
            let bounds = viewport(in: app)
            let frame = target.exists ? target.frame : .zero
            let position = start ? frame.minY : frame.maxY
            let desired = start ? bounds.minY + 12 : bounds.maxY - 12
            let visible =
                start
                ? position >= bounds.minY && position <= bounds.minY + 60
                : position <= bounds.maxY && position >= bounds.maxY - 60
            if target.exists && target.isHittable && visible {
                XCTAssertGreaterThanOrEqual(frame.minX, bounds.minX)
                XCTAssertLessThanOrEqual(frame.maxX, bounds.maxX)
                return frame
            }
            let distance = target.exists ? max(-180, min(180, position - desired)) : 180
            dragReading(target, distance: distance, attempt: attempt, in: app)
        }
        capture(target, name: "Noninteractive explanation boundary unavailable", in: app)
        XCTFail("Required beginning/end of noninteractive explanation is not readable")
        return .zero
    }

    private func establishUnrequestedCalendar(in app: XCUIApplication) -> Bool {
        let permission = app.buttons["Allow calendar access"]
        let restricted = app.staticTexts[
            "This iPhone restricts calendar access, perhaps by a work policy."]
        for attempt in 0..<24 {
            if app.buttons["Open Settings"].exists || restricted.exists {
                attach(
                    ["notRequestedEstablished": false, "knownDeniedOrRestricted": true],
                    name: "Calendar permission state safely omitted")
                return false
            }
            let bounds = viewport(in: app)
            let frame = permission.exists ? permission.frame : .zero
            if permission.exists && permission.isHittable && bounds.contains(frame) {
                capture(permission, name: "Unrequested calendar permission remains unchanged", in: app)
                return true
            }
            let distance = frame.isEmpty ? 180 : max(-180, min(180, frame.midY - bounds.midY))
            dragReading(permission, distance: distance, attempt: attempt, in: app)
        }
        capture(permission, name: "Calendar permission state not established without action", in: app)
        attach(
            ["notRequestedEstablished": false, "knownDeniedOrRestricted": false],
            name: "Calendar permission state safely omitted")
        return false
    }

    private func dragReading(_ target: XCUIElement, distance: CGFloat, attempt: Int, in app: XCUIApplication) {
        let bounds = viewport(in: app)
        let frame = target.exists ? target.frame : .zero
        let startY = min(bounds.maxY - 12, max(bounds.minY + 12, bounds.midY + 120))
        let endY = min(bounds.maxY - 12, max(bounds.minY + 12, startY - distance))
        let point = app.coordinate(withNormalizedOffset: .zero)
        let x =
            app.navigationBars.firstMatch.identifier == "Conversation"
            ? AssistantTranscriptPanGeometry.x(in: app, labels: links, startY: startY, endY: endY, test: self)
            : app.frame.maxX - 4
        XCTAssertTrue(bounds.contains(CGPoint(x: x, y: startY)))
        XCTAssertTrue(bounds.contains(CGPoint(x: x, y: endY)))
        attach(
            [
                "attempt": attempt, "exists": target.exists, "label": target.exists ? target.label : "unrealized",
                "frame": values(frame), "viewport": values(bounds), "start": [x, startY], "end": [x, endY],
            ],
            name: "Measured handoff reveal")
        point.withOffset(CGVector(dx: x, dy: startY)).press(
            forDuration: 0.1, thenDragTo: point.withOffset(CGVector(dx: x, dy: endY)),
            withVelocity: .slow, thenHoldForDuration: 0.2)
    }

    private func capture(_ target: XCUIElement, name: String, in app: XCUIApplication) {
        attach(
            [
                "label": target.exists ? target.label : "", "frame": target.exists ? values(target.frame) : [],
                "exists": target.exists, "enabled": target.exists && target.isEnabled,
                "hittable": target.exists && target.isHittable, "viewport": values(viewport(in: app)),
            ], name: name)
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        add(image)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + " accessibility tree"
        tree.lifetime = .keepAlways
        add(tree)
    }

    private func values(_ rect: CGRect) -> [Double] {
        [rect.minX, rect.minY, rect.width, rect.height].map(Double.init)
    }

    private func attach(_ payload: [String: Any], name: String) {
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]) {
            let item = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
            item.name = name
            item.lifetime = .keepAlways
            add(item)
        }
    }
}
