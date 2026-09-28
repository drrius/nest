import Foundation

extension PendingFinancialApproval.Command {
    var title: String {
        Self.titles[self] ?? "Financial proposal"
    }

    private static let titles: [Self: String] = [
        .expense: "Record expense",
        .correction: "Correct financial entry",
        .refund: "Record refund",
        .settlement: "Record payment",
        .createRule: "Create recurring expense",
        .updateRule: "Change recurring expense",
        .pauseRule: "Pause recurring expense",
        .cancelRule: "Cancel recurring expense",
        .resumeRule: "Resume recurring expense",
        .recordCycle: "Record recurring bill",
        .linkCycle: "Link an expense to a bill",
        .dismissLegacy: "Dismiss previous bill draft",
        .confirmLegacy: "Confirm previous bill draft",
        .adoptLegacy: "Set up a previous recurring expense",
    ]
}
