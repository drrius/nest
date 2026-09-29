import Foundation

extension SessionModel {
    func readLatestSummary(_ context: NotificationContext) async throws -> LatestDailySummary {
        let token = try await notificationToken(context)
        guard let notificationAPI else { throw NestAPIFailure.configuration }
        let result = try await notificationAPI.latestSummary(token: token, member: context.member)
        try requireNotificationAccount(context)
        return result
    }

    func readSummary(_ context: NotificationContext, id: UUID) async throws -> DailySummarySnapshot {
        let token = try await notificationToken(context)
        guard let notificationAPI else { throw NestAPIFailure.configuration }
        let result = try await notificationAPI.summary(token: token, member: context.member, id: id)
        try requireNotificationAccount(context)
        return result
    }
}
