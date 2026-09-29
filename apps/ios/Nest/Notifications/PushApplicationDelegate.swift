import UIKit
import UserNotifications

@MainActor
final class PushApplicationDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    let inbox = PushNotificationInbox()

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Attach before the SwiftUI auth restore so a cold-start tap can wait for verified membership.
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping @Sendable () -> Void
    ) {
        let data =
            response.actionIdentifier == UNNotificationDefaultActionIdentifier
            ? Self.routingData(response.notification.request.content.userInfo) : nil
        finishResponse(data: data, completion: completionHandler)
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter, willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping @Sendable (UNNotificationPresentationOptions) -> Void
    ) {
        let data = Self.routingData(notification.request.content.userInfo)
        Task { @MainActor in
            let options: UNNotificationPresentationOptions =
                data.map { inbox.mayPresent($0) ? [.banner, .sound] : [] } ?? []
            completionHandler(options)
        }
    }

    nonisolated func finishResponse(data: Data?, completion: @escaping @Sendable () -> Void) {
        Task { @MainActor in
            if let data { inbox.receive(data) }
            // UIKit's cold-start completion updates snapshots and must run on the main thread.
            completion()
        }
    }

    nonisolated private static func routingData(_ userInfo: [AnyHashable: Any]) -> Data? {
        guard let value = userInfo["nest"], JSONSerialization.isValidJSONObject(value),
            let data = try? JSONSerialization.data(withJSONObject: value), data.count <= 4096
        else { return nil }
        return data
    }
}
