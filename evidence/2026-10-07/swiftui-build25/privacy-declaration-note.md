The new native request correlation and user-shared support report require diagnostic
collection declarations. PerformanceData and OtherDiagnosticData are declared for
AppFunctionality, no tracking. Linked=true conservatively covers support reports
submitted by an identified owner. Data payload remains redacted and device-local
until explicitly shared; server spans contain fixed request metadata only.
Existing nine declarations remain unchanged. Public Store privacy metadata is a
separate release task; no public Store release or questionnaire change occurs here.
