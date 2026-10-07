# Anonymous contrast report overlays

Direct inspection of the existing four failure-associated screenshots narrows the
anonymous reports without another audit. Both Meals overlays outline Tuesday's
breakfast/Add meal row behind the native tab bar. Both Money overlays outline the
second recent-activity row behind the same bar. Complete issue descriptions still
contain only Contrast failed for SwiftUI.AccessibilityNode; they do not name the
elements. The manifest ties each image to its actual failed test.

This is visual region evidence, not exact accessibility-node identity or proof of
a false positive. All four anonymous reports and the full audits remain failed.
The next useful comparison is the highlighted row fully visible during ordinary
scrolling, with retained unfiltered findings. Further palette changes are not
supported by these obscured captures. Existing three identified reports already
have bounded tab-bar geometry evidence.

`diagnosis.json` records original source identity and hashes of the inspected
images. No app mutation, native rerun, financial action or report suppression occurs.
