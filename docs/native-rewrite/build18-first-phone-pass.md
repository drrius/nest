# Build18 phone layout check

SwiftUI0.1.0/build18 is available to internal testers. Update Nest in TestFlight and open Today,
Meals, Calendar and Money from the bottom tabs. Each should have the same left
and right margins, title height, context label spacing and Profile/assistant
placement. Calendar should use the same Quiet card treatment as the other tabs.
The tabs retain their different contents and actions.

Check once in your normal appearance/text size, then in dark mode and your
preferred larger text size. Titles and actions should remain readable and usable;
at accessibility text sizes, all tabs place the actions on a separate row.
Open Profile from each tab and return. On Today, scroll to Groceries: its title
and summary should remain readable at your preferred text size. At accessibility
sizes the text uses the full card width. Open it and return without changing items. Opening the assistant checks navigation
only while live AI remains blocked by Gateway account verification.

Please report any tab that still feels misaligned, with its text size and a
screenshot. This is a layout check; it does not close the full two-phone, live AI,
calendar privacy, offline, notification or financial acceptance checklist.
