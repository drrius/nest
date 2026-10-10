import Foundation

struct SchedulingAvailability {
    private(set) var local: BusyState = .unknown
    private(set) var snapshots: BusySnapshotsEnvelope?
    private(set) var loading = false
    private var requestId = UUID()

    mutating func begin() -> UUID {
        clear()
        loading = true
        return requestId
    }

    func isCurrent(_ request: UUID) -> Bool { requestId == request }

    mutating func setLocal(_ value: BusyState, request: UUID) {
        guard isCurrent(request) else { return }
        local = value
    }

    mutating func setSnapshots(_ value: BusySnapshotsEnvelope?, request: UUID) {
        guard isCurrent(request) else { return }
        snapshots = value
    }

    mutating func finish(_ request: UUID) {
        guard isCurrent(request) else { return }
        loading = false
    }

    mutating func clear() {
        requestId = UUID()
        local = .unknown
        snapshots = nil
        loading = false
    }
}
