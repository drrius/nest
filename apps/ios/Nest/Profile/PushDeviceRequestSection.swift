import SwiftUI

struct PushDeviceRequestSection: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let hardware: NativePushDevice
    @ObservedObject var model: PushDeviceModel
    let saved: SavedPushDeviceRequest

    var body: some View {
        Section("Saved connection request") {
            if let result = saved.result, result.status != .unresolved {
                Text(
                    result.status == .recorded
                        ? "Nest recorded this request. Reload to see the current connection."
                        : "Nest confirmed cancellation of this request.")
                Button("Continue and reload") {
                    Task { await model.continueAfterResult(session: session, member: member, hardware: hardware) }
                }
            } else {
                Text(
                    saved.cancellationRequested
                        ? "Cancellation is not confirmed yet." : "This connection change is not confirmed yet.")
                Button("Check saved request") {
                    Task { await model.recover(session: session, member: member, hardware: hardware) }
                }
                if !saved.cancellationRequested {
                    Button("Retry original request") {
                        Task { await model.recover(session: session, member: member, hardware: hardware, retry: true) }
                    }
                }
                Button(saved.cancellationRequested ? "Retry cancellation" : "Cancel saved request") {
                    Task { await model.recover(session: session, member: member, hardware: hardware, cancel: true) }
                }
                Text(
                    "Checking only reads the result. Cancellation may discover that the original request was already recorded; it does not undo that result."
                )
                .font(.footnote).foregroundStyle(QuietPalette.muted)
            }
        }.disabled(model.busy)
    }
}
