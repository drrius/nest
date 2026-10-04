import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct ExpenseReceiptSection: View {
    @ObservedObject var session: SessionModel
    let context: ExpenseContext
    @Binding var path: String?
    @Binding var ready: Bool
    @State private var saved: SavedReceiptUpload?
    @State private var photo: PhotosPickerItem?
    @State private var choosePDF = false
    @State private var working = false
    @State private var receiptLoaded = false
    @State private var notice: String?

    var body: some View {
        Section("Receipt (optional)") {
            if let saved {
                Text(
                    saved.cleanupRequested
                        ? "Removal pending" : saved.reservation == nil ? "Upload pending" : "Receipt attached")
                if saved.reservation == nil || saved.cleanupRequested {
                    Button(saved.cleanupRequested ? "Retry removal" : "Retry upload") { Task { await retry() } }
                }
                if !saved.cleanupRequested { Button("Remove receipt", role: .destructive) { Task { await remove() } } }
            } else {
                PhotosPicker(selection: $photo, matching: .images) { Label("Choose photo", systemImage: "photo") }
                Button {
                    choosePDF = true
                } label: {
                    Label("Choose PDF", systemImage: "doc")
                }
                Text("Photos are resized and location metadata removed. PDFs must be under 4 MB.")
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
            }
            if working { ProgressView("Preparing receipt…") }
            if let notice { Text(notice).font(.footnote) }
        }
        .disabled(working)
        .task { await refresh() }
        .task(id: photo) {
            guard let photo else { return }
            await perform {
                guard let data = try await photo.loadTransferable(type: Data.self) else { throw NestAPIFailure.invalid }
                let normalized = try await Task.detached(priority: .userInitiated) { try ReceiptMedia.photo(data) }
                    .value
                try Task.checkCancellation()
                try await stage(normalized, contentType: "image/jpeg")
            }
            self.photo = nil
        }
        .fileImporter(isPresented: $choosePDF, allowedContentTypes: [.pdf]) { result in
            Task { await perform { try await stage(ReceiptMedia.pdf(result.get()), contentType: "application/pdf") } }
        }
    }

    private func stage(_ data: Data, contentType: String) async throws {
        try await session.stageReceipt(data: data, contentType: contentType, context: context)
        _ = try await session.retryReceipt(context)
    }

    private func retry() async { await perform { _ = try await session.retryReceipt(context) } }
    private func remove() async { await perform { _ = try await session.removeReceipt(context) } }

    private func perform(_ action: () async throws -> Void) async {
        guard !working else { return }
        working = true
        ready = false
        defer {
            working = false
            ready = receiptLoaded && (saved == nil || (path != nil && saved?.cleanupRequested == false))
        }
        do {
            try await action()
            notice = nil
        } catch {
            notice = "Receipt not confirmed. Retry if it is pending, or choose a smaller photo or PDF."
        }
        await refresh()
        if notice != nil, receiptLoaded, saved?.cleanupRequested == true {
            notice = "Removal is not confirmed yet. Retry removal when connected."
        }
    }

    private func refresh() async {
        do {
            saved = try await session.savedReceipt(context)
            receiptLoaded = true
            path = saved?.cleanupRequested == false ? saved?.reservation?.path : nil
            ready = !working && (saved == nil || (path != nil && saved?.cleanupRequested == false))
        } catch {
            receiptLoaded = false
            ready = false
            path = nil
            notice = "Could not load the saved receipt. Reopen this form to try again."
        }
    }
}
