import SwiftUI
import UIKit
import XCTest

@testable import Nest

@MainActor
final class CookingNotesEditorTests: XCTestCase {
    func testNativeInputPreservesUTF16TextAndUsesLargestBodyFont() throws {
        var text = String(repeating: "🍲", count: 998) + "end"
        let (window, view) = try editor(
            Binding(get: { text }, set: { text = $0 }), category: .accessibilityExtraExtraExtraLarge)
        defer { window.isHidden = true }
        XCTAssertEqual(view.text, text)
        XCTAssertEqual(view.accessibilityLabel, "Cooking notes")
        let font = try XCTUnwrap(view.font)
        let expected = UIFont.preferredFont(forTextStyle: .body, compatibleWith: view.traitCollection)
        XCTAssertEqual(font.pointSize, expected.pointSize, accuracy: 0.1)
        XCTAssertGreaterThan(font.pointSize, 17)
        XCTAssertTrue(view.adjustsFontForContentSizeCategory)
        view.selectedRange = NSRange(location: text.utf16.count, length: 0)
        view.insertText("!")
        XCTAssertEqual(text, String(repeating: "🍲", count: 998) + "end!")
        XCTAssertEqual(text.utf16.count, 2_000)
        XCTAssertEqual(view.selectedRange.location, 2_000)
    }

    func testCompleteFinalLineIsScrollableAtLargestTextSize() async throws {
        var text = """
            Fictional unsaved kitchen notes.
            Keep weekday cooking simple.
            Use the ingredients already available.
            Choose meals with familiar steps.
            Leave time to wash up.
            Share preparation when useful.
            This is a keyboard visibility check.
            Nothing here will be saved.
            """
        let (window, view) = try editor(
            Binding(get: { text }, set: { text = $0 }), category: .accessibilityExtraExtraExtraLarge)
        defer { window.isHidden = true }
        XCTAssertTrue(view.becomeFirstResponder())
        await Task.yield()
        view.selectedRange = NSRange(location: text.utf16.count, length: 0)
        view.insertText("!")
        view.layoutIfNeeded()
        let caret = view.caretRect(for: view.endOfDocument)
        XCTAssertGreaterThan(caret.height, 44)
        XCTAssertLessThanOrEqual(caret.maxY, view.contentSize.height)
        view.scrollRectToVisible(caret, animated: false)
        for _ in 0..<20 where !view.bounds.contains(caret) {
            try await Task.sleep(for: .milliseconds(25))
        }
        XCTAssertTrue(
            view.bounds.contains(caret),
            "Final caret \(caret) must fit visible bounds \(view.bounds), content \(view.contentSize).")
        XCTAssertTrue(text.hasSuffix("Nothing here will be saved.!"))
    }

    func testDisabledFormPreventsNativeEditingAndSelection() throws {
        let (window, view) = try editor(.constant("Retained notes"), enabled: false, category: .large)
        defer { window.isHidden = true }
        XCTAssertEqual(view.text, "Retained notes")
        XCTAssertFalse(view.isEditable)
        XCTAssertFalse(view.isSelectable)
    }

    private func editor(
        _ text: Binding<String>, enabled: Bool = true, category: UIContentSizeCategory
    ) throws -> (UIWindow, UITextView) {
        let controller = UIHostingController(
            rootView: CookingNotesEditor(text: text)
                .environment(\.isEnabled, enabled).frame(width: 311, height: 240))
        controller.traitOverrides.preferredContentSizeCategory = category
        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 375, height: 667)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        window.layoutIfNeeded()
        controller.view.layoutIfNeeded()
        return (window, try XCTUnwrap(textView(in: controller.view)))
    }

    private func textView(in view: UIView) -> UITextView? {
        if let editor = view as? UITextView { return editor }
        for child in view.subviews {
            if let editor = textView(in: child) { return editor }
        }
        return nil
    }
}
