import XCTest

@MainActor
final class NativeContrastProbeTests: XCTestCase {
  func testNativeTabsWithoutEdgeFade() throws {
    try audit(withoutTabs: false, hideEdge: true)
  }
  func testNativeTabsContrast() throws { try audit(withoutTabs: false) }
  func testPlainScrollContrast() throws { try audit(withoutTabs: true) }

  private func audit(withoutTabs: Bool, hideEdge: Bool = false) throws {
    let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest.contrastprobe")
    if withoutTabs { app.launchArguments = ["--without-tabs"] }
    if hideEdge { app.launchArguments.append("--hide-edge") }
    app.launch()
    XCTAssertTrue(app.staticTexts["Section 1"].waitForExistence(timeout: 20))
    let tabs = app.tabBars.firstMatch
    XCTAssertEqual(tabs.exists, !withoutTabs)
    let observation: [String: Any] = [
      "withoutTabs": withoutTabs,
      "hideEdge": hideEdge,
      "tabBarFrame": frame(tabs.exists ? tabs.frame : .zero),
      "paragraphs": app.staticTexts.allElementsBoundByIndex.filter {
        $0.label.hasPrefix("Paragraph")
      }.map {
        ["label": $0.label, "frame": frame($0.frame)] as [String: Any]
      },
    ]
    attach(observation, name: "Initial element positions")
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = withoutTabs ? "Plain scroll viewport" : "Native tabs viewport"
    screenshot.lifetime = .keepAlways
    add(screenshot)
    continueAfterFailure = true
    try app.performAccessibilityAudit(for: .contrast) { issue in
      let observation: [String: Any] = [
        "label": issue.element?.label ?? "",
        "frame": self.frame(issue.element?.frame ?? .zero),
        "detail": issue.detailedDescription,
        "summary": issue.compactDescription,
        "tabBarFrame": self.frame(tabs.exists ? tabs.frame : .zero),
      ]
      self.attach(observation, name: "Unfiltered contrast issue")
      return false
    }
  }

  private func frame(_ rect: CGRect) -> [Double] {
    [rect.minX, rect.minY, rect.width, rect.height]
  }

  private func attach(_ observation: [String: Any], name: String) {
    guard
      let data = try? JSONSerialization.data(withJSONObject: observation, options: [.sortedKeys])
    else {
      XCTFail("Could not encode diagnostic observation")
      return
    }
    let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
