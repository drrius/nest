import XCTest

@MainActor
enum AssistantTranscriptPanGeometry {
    static func x(
        in app: XCUIApplication, labels: [String], startY: CGFloat, endY: CGFloat, test: XCTestCase
    ) -> CGFloat {
        XCTAssertEqual(app.navigationBars.firstMatch.identifier, "Conversation")
        let links = NSPredicate(format: "label IN %@", labels)
        let x = app.frame.minX + 24
        let start = CGPoint(x: x, y: startY)
        let end = CGPoint(x: x, y: endY)
        let scrollers = app.scrollViews.allElementsBoundByIndex.filter {
            $0.exists && $0.frame.contains(start) && $0.frame.contains(end)
                && $0.buttons.matching(links).count > 0
        }
        XCTAssertEqual(scrollers.count, 1, "Require the actual unique foreground handoff transcript scroller")
        guard let scroller = scrollers.first else { return x }
        let bars = app.otherElements.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Vertical scroll bar")
        ).allElementsBoundByIndex.filter { $0.exists && !($0.frame.isEmpty) }
        XCTAssertFalse(bars.isEmpty, "Require measured scroll-indicator regions before the transcript pan")
        for bar in bars {
            XCTAssertFalse(bar.frame.contains(start))
            XCTAssertFalse(bar.frame.contains(end))
        }
        let buttons = scroller.buttons.matching(links).allElementsBoundByIndex.filter { $0.exists }
        XCTAssertFalse(buttons.isEmpty)
        for button in buttons {
            XCTAssertLessThan(x, button.frame.minX, "Pan through left padding, outside interactive handoff labels")
        }
        let data = try? JSONSerialization.data(
            withJSONObject: [
                "gestureX": x, "start": [x, startY], "end": [x, endY],
                "scroller": frame(scroller.frame), "scrollBars": bars.map { frame($0.frame) },
                "handoffButtons": buttons.map { ["label": $0.label, "frame": frame($0.frame)] },
                "foregroundNavigation": app.navigationBars.firstMatch.identifier,
            ], options: [.sortedKeys])
        if let data {
            let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
            attachment.name = "Measured transcript padding outside scroll indicators and handoff targets"
            attachment.lifetime = .keepAlways
            test.add(attachment)
        }
        return x
    }

    private static func frame(_ rect: CGRect) -> [Double] {
        [rect.minX, rect.minY, rect.width, rect.height].map(Double.init)
    }
}
