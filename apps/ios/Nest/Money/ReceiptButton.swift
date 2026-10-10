import SafariServices
import SwiftUI

struct ReceiptButton: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let eventId: UUID
    @State private var opening = false
    @State private var notice: String?
    @State private var receipt: ReceiptDestination?

    var body: some View {
        Button(opening ? "Opening receipt…" : "View receipt") { Task { await open() } }.disabled(opening)
            .sheet(item: $receipt) { destination in ReceiptBrowser(url: destination.url) }
        if let notice { Text(notice).font(.footnote) }
    }

    private func open() async {
        opening = true
        notice = nil
        defer { opening = false }
        do {
            let url = try await session.readReceiptLink(
                member: member, generation: session.generation, eventId: eventId)
            try Task.checkCancellation()
            receipt = .init(url: url)
        } catch { notice = "Could not open this receipt. It may have been removed; try again online." }
    }
}

private struct ReceiptDestination: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ReceiptBrowser: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
