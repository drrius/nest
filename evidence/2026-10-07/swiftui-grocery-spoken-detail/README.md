# Grocery details in the native accessible value

Source `eae60688` keeps the item name as the row label and includes its quantity,
unit/category detail, pickup state and plain-language sync status in the accessible
value. The previous explicit item-name label hid those visible details from the
row's spoken description. The check/uncheck hint names the action. Existing guarded
rice/reminder and conflict assertions follow the changed user-visible value.

A source-matched signed build passes. One read-only native method passes on
the existing100g QA rice fixture; it opens Groceries, checks the actual accessible
value without toggling the item, captures the row and returns to Today. Its accessible value is exactly100 g,
To pick up; the56pt row is fully visible and hittable. The actual screenshot and
accessibility tree are inspected. Original scopes/64 journals/settings/local
choices restore. Zero failures/skips. No grocery change is made.

This fixes exposed accessibility semantics. It cannot establish actual VoiceOver
speech, traversal, both-phone acceptance, every grocery state or complete M1/M4.
