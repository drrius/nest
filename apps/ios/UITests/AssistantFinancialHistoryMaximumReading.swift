import XCTest

@MainActor
struct AssistantFinancialHistoryMaximumReading {
    let app: XCUIApplication
    let test: XCTestCase

    func element(_ label: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
    }

    func read(_ label: String) {
        let target = element(label)
        reveal(target, permitsTallText: true)
        XCTAssertTrue(target.exists, "Required exact recorded value: \(label)")
        if target.frame.height > viewport.height {
            XCTAssertEqual(target.elementType, .staticText)
            readAcrossScrolling(target)
        } else {
            XCTAssertTrue(viewport.contains(target.frame), "Complete recorded value: \(label)")
        }
    }

    func requireTarget(_ target: XCUIElement, bounds: CGRect? = nil) {
        XCTAssertTrue(target.exists && target.isEnabled && target.isHittable)
        XCTAssertTrue((bounds ?? viewport).contains(target.frame))
        XCTAssertTrue(app.frame.contains(target.frame))
        XCTAssertGreaterThanOrEqual(target.frame.width, 44 - 1e-9)
        XCTAssertGreaterThanOrEqual(target.frame.height, 44 - 1e-9)
    }

    var viewport: CGRect {
        let navigation = app.navigationBars.firstMatch
        let top = navigation.exists ? navigation.frame.maxY : app.frame.minY
        let bottom = app.tabBars.firstMatch.frame.minY
        return CGRect(x: app.frame.minX, y: top, width: app.frame.width, height: bottom - top)
    }

    func reveal(_ target: XCUIElement, permitsTallText: Bool = false) {
        for attempt in 0..<24 {
            let bounds = viewport
            let frame = target.exists ? target.frame : .zero
            if target.exists && permitsTallText && target.elementType == .staticText && frame.height > bounds.height {
                return
            }
            if target.exists && !frame.isEmpty && bounds.contains(frame) { return }
            let distance = frame.isEmpty ? 250 : max(-180, min(250, frame.midY - bounds.midY))
            pan(target, distance: distance, attempt: attempt)
        }
        capture(target, name: "Maximum required recorded target outside viewport")
        XCTFail("Exact recorded target not fully visible within bounded search")
    }

    private func readAcrossScrolling(_ target: XCUIElement) {
        let first = revealBoundary(target, beginning: true)
        let firstViewport = viewport
        XCTAssertGreaterThanOrEqual(first.minY, firstViewport.minY)
        XCTAssertGreaterThanOrEqual(first.minX, firstViewport.minX)
        XCTAssertLessThanOrEqual(first.maxX, firstViewport.maxX)
        capture(target, name: "Maximum noninteractive recorded text beginning")
        let last = revealBoundary(target, beginning: false)
        let lastViewport = viewport
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
                "label": target.label, "first": values(first), "last": values(last),
                "firstViewport": values(firstViewport), "lastViewport": values(lastViewport),
                "firstCovered": firstCovered, "lastCovered": lastCovered, "overlap": overlap,
            ],
            name: "Maximum continuous noninteractive recorded text coverage")
    }

    private func revealBoundary(_ target: XCUIElement, beginning: Bool) -> CGRect {
        for attempt in 0..<24 {
            let bounds = viewport
            let frame = target.exists ? target.frame : .zero
            let position = beginning ? frame.minY : frame.maxY
            let desired = beginning ? bounds.minY + 12 : bounds.maxY - 12
            let visible =
                beginning
                ? position >= bounds.minY && position <= bounds.minY + 60
                : position <= bounds.maxY && position >= bounds.maxY - 60
            if target.exists && target.isHittable && visible { return frame }
            let distance = max(-180, min(250, position - desired))
            pan(target, distance: distance, attempt: attempt)
        }
        capture(target, name: "Maximum recorded text boundary failure")
        XCTFail("Noninteractive recorded text boundary not fully readable")
        return target.exists ? target.frame : .zero
    }

    private func pan(_ target: XCUIElement, distance: CGFloat, attempt: Int) {
        let bounds = viewport
        let startY = min(bounds.maxY - 12, max(bounds.minY + 12, bounds.midY + 120))
        let endY = min(bounds.maxY - 12, max(bounds.minY + 12, startY - distance))
        let regions = app.buttons.allElementsBoundByIndex.filter {
            $0.exists && $0.frame.intersects(bounds)
        }.map(\.frame)
        let x = min(app.frame.minX + 24, (regions.map(\.minX).min() ?? bounds.maxX) - 4)
        XCTAssertGreaterThanOrEqual(x, app.frame.minX + 4)
        let start = CGPoint(x: x, y: startY)
        let end = CGPoint(x: x, y: endY)
        XCTAssertTrue(bounds.contains(start) && bounds.contains(end))
        let scrollers = measuredScrollers(start: start, end: end)
        let bars = app.otherElements.allElementsBoundByIndex.filter {
            $0.exists && $0.label.hasPrefix("Vertical scroll bar") && !$0.frame.isEmpty
        }
        for bar in bars {
            XCTAssertFalse(bar.frame.contains(start) || bar.frame.contains(end))
        }
        XCTAssertLessThan(x, regions.map(\.minX).min() ?? bounds.maxX)
        attach(
            [
                "attempt": attempt, "target": target.exists ? target.label : "unrealized recorded target",
                "targetFrame": target.exists ? values(target.frame) : [], "viewport": values(bounds),
                "start": [x, startY], "end": [x, endY], "scrollers": scrollers.map { values($0.frame) },
                "scrollBars": bars.map { values($0.frame) }, "actionRegions": regions.map(values),
                "navigation": app.navigationBars.firstMatch.identifier,
            ],
            name: "Maximum recorded history measured left-padding pan")
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: start.x, dy: start.y)).press(
            forDuration: 0.1, thenDragTo: origin.withOffset(CGVector(dx: end.x, dy: end.y)),
            withVelocity: .slow, thenHoldForDuration: 0.2)
    }

    private func measuredScrollers(start: CGPoint, end: CGPoint) -> [XCUIElement] {
        let candidates = app.scrollViews.allElementsBoundByIndex + app.collectionViews.allElementsBoundByIndex
        let scrollers = candidates.filter {
            $0.exists && $0.frame.contains(start) && $0.frame.contains(end)
        }
        XCTAssertEqual(scrollers.count, 1, "Require the measured unique foreground recorded-history scroller")
        return scrollers
    }

    func back(from: String, to: String) {
        let target = app.navigationBars[from].buttons.element(boundBy: 0)
        requireTarget(target, bounds: app.navigationBars[from].frame)
        target.tap()
        XCTAssertTrue(app.navigationBars[to].waitForExistence(timeout: 15))
    }

    func restoreToday() {
        let known = ["Entry details", "Review bill", "Conversation", "Private conversations", "Profile"]
        for _ in 0..<4 {
            let navigation = app.navigationBars.firstMatch
            if !navigation.exists { break }
            XCTAssertTrue(known.contains(navigation.identifier))
            let target = navigation.buttons.element(boundBy: 0)
            requireTarget(target, bounds: navigation.frame)
            target.tap()
        }
        let today = app.tabBars.firstMatch.buttons["Today"]
        requireTarget(today, bounds: app.tabBars.firstMatch.frame)
        today.tap()
        XCTAssertTrue(today.isSelected)
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        capture(app.buttons["Me + shared"], name: "Maximum recorded history returned original Today")
    }

    func capture(_ target: XCUIElement, name: String) {
        attach(
            [
                "label": target.exists ? target.label : "", "frame": target.exists ? values(target.frame) : [],
                "exists": target.exists, "enabled": target.exists && target.isEnabled,
                "hittable": target.exists && target.isHittable, "viewport": values(viewport),
            ], name: name)
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        test.add(image)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + " accessibility tree"
        tree.lifetime = .keepAlways
        test.add(tree)
    }

    private func values(_ frame: CGRect) -> [Double] {
        [frame.minX, frame.minY, frame.width, frame.height].map(Double.init)
    }

    private func attach(_ payload: [String: Any], name: String) {
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]) {
            let item = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
            item.name = name
            item.lifetime = .keepAlways
            test.add(item)
        }
    }
}
