import XCTest

@MainActor
struct AssistantFinancialHistoryMaximumReading {
    let app: XCUIApplication
    let test: XCTestCase
    var minimumContentY: CGFloat = 0
    var contentIdentifier: String?

    func element(_ label: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
    }

    func read(_ label: String) throws {
        let target = element(label)
        try reveal(target, permitsTallText: true)
        let bounds = try viewport()
        let observed = target.exists ? target.frame : nil
        guard let frame = observed, usable(frame) else {
            capture(target, name: "Unrealized recorded value after reveal")
            XCTFail("Required exact recorded value has no finite frame: \(label)")
            throw GeometryFailure.targetUnavailable
        }
        if frame.height > bounds.height {
            XCTAssertEqual(target.elementType, .staticText)
            try readAcrossScrolling(target)
        } else {
            XCTAssertTrue(bounds.contains(frame), "Complete recorded value: \(label)")
        }
    }

    func requireTarget(_ target: XCUIElement, bounds: CGRect? = nil) throws {
        let box = try bounds ?? viewport()
        let observed = target.exists ? target.frame : nil
        guard let frame = observed, usable(box) && usable(frame) else {
            capture(target, name: "Invalid tapped-target geometry")
            XCTFail("A tapped target requires finite known target and viewport geometry")
            throw GeometryFailure.targetUnavailable
        }
        XCTAssertTrue(target.isEnabled && target.isHittable)
        XCTAssertTrue(box.contains(frame) && app.frame.contains(frame))
        XCTAssertGreaterThanOrEqual(frame.width, 44 - 1e-9)
        XCTAssertGreaterThanOrEqual(frame.height, 44 - 1e-9)
    }

    private func usable(_ frame: CGRect) -> Bool {
        [frame.minX, frame.minY, frame.width, frame.height, frame.maxX, frame.maxY, frame.midX, frame.midY].allSatisfy {
            $0.isFinite
        }
            && !frame.isNull && !frame.isInfinite && frame.width > 0 && frame.height > 0
    }

    private func observedViewport() -> CGRect? {
        if contentIdentifier != nil { return scopedViewport() }
        let screen = app.frame
        let bar = app.tabBars.firstMatch
        guard usable(screen) && bar.exists && usable(bar.frame) else { return nil }
        let navigation = app.navigationBars.firstMatch
        var top = max(screen.minY, minimumContentY)
        if navigation.exists {
            guard usable(navigation.frame) else { return nil }
            top = max(top, navigation.frame.maxY)
        }
        let bottom = bar.frame.minY
        guard bottom.isFinite && top.isFinite && bottom > top else { return nil }
        return CGRect(x: screen.minX, y: top, width: screen.width, height: bottom - top)
    }

    private func scopedViewport() -> CGRect? {
        let screen = app.frame
        let candidates = scrollCandidates()
        guard usable(screen), candidates.count == 1, usable(candidates[0].frame) else { return nil }
        let content = candidates[0].frame.intersection(screen)
        let navigation = app.navigationBars.firstMatch
        guard usable(content), navigation.exists, usable(navigation.frame) else { return nil }
        let top = max(content.minY, minimumContentY, navigation.frame.maxY)
        guard top.isFinite, content.maxY > top else { return nil }
        return CGRect(x: content.minX, y: top, width: content.width, height: content.maxY - top)
    }

    func viewport() throws -> CGRect {
        for attempt in 0..<12 {
            if let bounds = observedViewport() { return bounds }
            attach(
                [
                    "attempt": attempt, "appFrame": diagnostic(app.frame),
                    "navigation": frameObservation(app.navigationBars.firstMatch),
                    "tabBar": frameObservation(app.tabBars.firstMatch),
                ],
                name: "Waiting for finite recorded-history viewport")
            Thread.sleep(forTimeInterval: 0.1)
        }
        captureView(name: "Recorded-history viewport remained unknown")
        XCTFail("No finite known viewport; no gesture or target acceptance is permitted")
        throw GeometryFailure.viewportUnavailable
    }

    func reveal(_ target: XCUIElement, permitsTallText: Bool = false) throws {
        for attempt in 0..<24 {
            let bounds = try viewport()
            let frame = target.exists ? target.frame : nil
            if let frame, usable(frame) {
                if permitsTallText && target.elementType == .staticText && frame.height > bounds.height { return }
                if bounds.contains(frame) { return }
            }
            let distance = frame.map { usable($0) ? max(-180, min(250, $0.midY - bounds.midY)) : 250 } ?? 250
            try pan(target, distance: distance, attempt: attempt)
        }
        capture(target, name: "Maximum required recorded target outside viewport")
        XCTFail("Exact recorded target not fully visible within bounded search")
        throw GeometryFailure.targetUnavailable
    }

    private func readAcrossScrolling(_ target: XCUIElement) throws {
        let first = try revealBoundary(target, beginning: true)
        let firstViewport = try viewport()
        XCTAssertGreaterThanOrEqual(first.minY, firstViewport.minY)
        XCTAssertGreaterThanOrEqual(first.minX, firstViewport.minX)
        XCTAssertLessThanOrEqual(first.maxX, firstViewport.maxX)
        capture(target, name: "Maximum noninteractive recorded text beginning")
        let last = try revealBoundary(target, beginning: false)
        let lastViewport = try viewport()
        XCTAssertLessThanOrEqual(last.maxY, lastViewport.maxY)
        XCTAssertGreaterThanOrEqual(last.minX, lastViewport.minX)
        XCTAssertLessThanOrEqual(last.maxX, lastViewport.maxX)
        capture(target, name: "Maximum noninteractive recorded text ending")
        XCTAssertEqual(first.height, last.height, accuracy: 0.5)
        let firstCovered = min(first.height, firstViewport.maxY - first.minY)
        let lastCovered = min(last.height, last.maxY - lastViewport.minY)
        let overlap = firstCovered + lastCovered - first.height
        XCTAssertGreaterThan(firstCovered, 0)
        XCTAssertGreaterThan(lastCovered, 0)
        XCTAssertGreaterThan(overlap, 0, "Continuous text coverage must overlap without an unread gap")
        attach(
            [
                "label": target.label, "first": diagnostic(first), "last": diagnostic(last),
                "firstViewport": diagnostic(firstViewport), "lastViewport": diagnostic(lastViewport),
                "firstCovered": firstCovered, "lastCovered": lastCovered, "overlap": overlap,
            ],
            name: "Maximum continuous noninteractive recorded text coverage")
    }

    private func revealBoundary(_ target: XCUIElement, beginning: Bool) throws -> CGRect {
        for attempt in 0..<24 {
            let bounds = try viewport()
            let frame = target.exists ? target.frame : nil
            if let frame, usable(frame) {
                let position = beginning ? frame.minY : frame.maxY
                let visible =
                    beginning
                    ? position >= bounds.minY && position <= bounds.minY + 60
                    : position <= bounds.maxY && position >= bounds.maxY - 60
                if target.isHittable && visible { return frame }
            }
            let desired = beginning ? bounds.minY + 12 : bounds.maxY - 12
            let position = frame.map { usable($0) ? (beginning ? $0.minY : $0.maxY) : desired + 250 } ?? desired + 250
            try pan(target, distance: max(-180, min(250, position - desired)), attempt: attempt)
        }
        capture(target, name: "Maximum recorded text boundary failure")
        XCTFail("Noninteractive recorded text boundary not fully readable")
        throw GeometryFailure.targetUnavailable
    }

    private func pan(_ target: XCUIElement, distance: CGFloat, attempt: Int) throws {
        let bounds = try viewport()
        XCTAssertTrue(distance.isFinite)
        let startY = min(bounds.maxY - 12, max(bounds.minY + 12, bounds.midY + 120))
        let endY = min(bounds.maxY - 12, max(bounds.minY + 12, startY - distance))
        let regions = visibleActionRegions(in: bounds)
        let x = min(app.frame.minX + 24, (regions.map(\.minX).min() ?? bounds.maxX) - 4)
        XCTAssertGreaterThanOrEqual(x, app.frame.minX + 4)
        let start = CGPoint(x: x, y: startY)
        let end = CGPoint(x: x, y: endY)
        guard [x, startY, endY].allSatisfy({ $0.isFinite }) && bounds.contains(start) && bounds.contains(end) else {
            XCTFail("No pan is allowed outside finite measured viewport geometry")
            throw GeometryFailure.viewportUnavailable
        }
        let scrollerFrame = try measuredScroller(start: start, end: end)
        let bars = observedScrollBars()
        for frame in bars { XCTAssertFalse(frame.contains(start) || frame.contains(end)) }
        XCTAssertLessThan(x, regions.map(\.minX).min() ?? bounds.maxX)
        attach(
            [
                "attempt": attempt, "target": target.exists ? target.label : "unrealized recorded target",
                "targetElementType": target.exists ? String(describing: target.elementType) : "absent",
                "targetFrame": frameObservation(target),
                "viewport": diagnostic(bounds), "start": [x, startY], "end": [x, endY],
                "scroller": diagnostic(scrollerFrame), "scrollBars": bars.map(diagnostic),
                "actionRegions": regions.map(diagnostic),
                "navigation":
                    app.navigationBars.firstMatch.exists
                    ? app.navigationBars.firstMatch.identifier : "absent",
            ],
            name: "Maximum recorded history finite left-padding pan")
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: start.x, dy: start.y)).press(
            forDuration: 0.1, thenDragTo: origin.withOffset(CGVector(dx: end.x, dy: end.y)),
            withVelocity: .slow, thenHoldForDuration: 0.2)
    }

    private func visibleActionRegions(in bounds: CGRect) -> [CGRect] {
        let candidates = app.buttons.allElementsBoundByIndex.filter { $0.exists }
        attach(
            ["actions": candidates.map { ["label": $0.label, "rawFrame": diagnostic($0.frame)] }],
            name: "Raw action-region geometry before recorded-history pan")
        return candidates.map(\.frame).filter { usable($0) && $0.intersects(bounds) }
    }

    private func observedScrollBars() -> [CGRect] {
        let candidates = app.otherElements.allElementsBoundByIndex.filter {
            $0.exists && $0.label.hasPrefix("Vertical scroll bar")
        }
        attach(
            ["scrollBars": candidates.map { ["label": $0.label, "rawFrame": diagnostic($0.frame)] }],
            name: "Raw scroll-indicator geometry before recorded-history pan")
        return candidates.map(\.frame).filter(usable)
    }

    private func measuredScroller(start: CGPoint, end: CGPoint) throws -> CGRect {
        for attempt in 0..<12 {
            let candidates = scrollCandidates()
            let frames = candidates.filter { $0.exists }.map(\.frame)
            let scrollers = frames.filter {
                usable($0) && $0.contains(start) && $0.contains(end)
            }
            attach(
                [
                    "attempt": attempt, "candidates": frames.map(diagnostic),
                    "validMatchingScrollers": scrollers.count,
                ], name: "Finite foreground scroller observation")
            if scrollers.count == 1 { return scrollers[0] }
            Thread.sleep(forTimeInterval: 0.1)
        }
        XCTFail("Require one finite known foreground scroller; no gesture was injected")
        throw GeometryFailure.scrollerUnavailable
    }

    private func scrollCandidates() -> [XCUIElement] {
        let candidates = app.scrollViews.allElementsBoundByIndex + app.collectionViews.allElementsBoundByIndex
        guard let contentIdentifier else { return candidates }
        return candidates.filter { $0.exists && $0.identifier == contentIdentifier }
    }

    func back(from: String, to: String) throws {
        let target = app.navigationBars[from].buttons.element(boundBy: 0)
        try requireTarget(target, bounds: app.navigationBars[from].frame)
        target.tap()
        XCTAssertTrue(app.navigationBars[to].waitForExistence(timeout: 15))
    }

    func restoreToday() throws {
        let known = ["Entry details", "Review bill", "Conversation", "Private conversations", "Profile"]
        for _ in 0..<4 {
            let navigation = app.navigationBars.firstMatch
            if !navigation.exists { break }
            XCTAssertTrue(known.contains(navigation.identifier))
            let target = navigation.buttons.element(boundBy: 0)
            try requireTarget(target, bounds: navigation.frame)
            target.tap()
        }
        let today = app.tabBars.firstMatch.buttons["Today"]
        try requireTarget(today, bounds: app.tabBars.firstMatch.frame)
        today.tap()
        XCTAssertTrue(today.isSelected)
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        capture(app.buttons["Me + shared"], name: "Maximum recorded history returned original Today")
    }

    func capture(_ target: XCUIElement, name: String) {
        attach(
            [
                "label": target.exists ? target.label : "", "exists": target.exists,
                "frame": frameObservation(target),
                "enabled": target.exists && target.isEnabled, "hittable": target.exists && target.isHittable,
                "observedViewport": viewportObservation(),
            ], name: name)
        captureView(name: name)
    }

    private func frameObservation(_ element: XCUIElement) -> [String: Any] {
        guard element.exists else { return ["state": "absent"] }
        return diagnostic(element.frame)
    }

    private func viewportObservation() -> [String: Any] {
        guard let frame = observedViewport() else { return ["state": "unknown"] }
        return diagnostic(frame)
    }

    private func captureView(name: String) {
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        test.add(image)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + " accessibility tree"
        tree.lifetime = .keepAlways
        test.add(tree)
    }

    private func diagnostic(_ frame: CGRect) -> [String: Any] {
        let fields = [
            "minX": frame.minX, "minY": frame.minY, "width": frame.width, "height": frame.height,
            "maxX": frame.maxX, "maxY": frame.maxY, "midX": frame.midX, "midY": frame.midY,
        ]
        var result: [String: Any] = ["isNull": frame.isNull, "isInfinite": frame.isInfinite, "usable": usable(frame)]
        for (name, value) in fields {
            result[name] =
                value.isFinite
                ? Double(value) as Any
                : [
                    "state": "nonfinite", "rawType": "CGFloat", "representation": String(describing: value),
                ]
        }
        return result
    }

    private func attach(_ payload: [String: Any], name: String) {
        guard JSONSerialization.isValidJSONObject(payload) else {
            let fallback = XCTAttachment(string: String(reflecting: payload))
            fallback.name = name + " invalid JSON diagnostic"
            fallback.lifetime = .keepAlways
            test.add(fallback)
            XCTFail("Diagnostic payload was not valid JSON; raw string retained")
            return
        }
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]) {
            let item = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
            item.name = name
            item.lifetime = .keepAlways
            test.add(item)
        }
    }
}

private enum GeometryFailure: Error { case targetUnavailable, viewportUnavailable, scrollerUnavailable }
