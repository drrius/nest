import Foundation

struct BusyInterval: Codable, Equatable, Sendable {
    let start: Int64
    let end: Int64

    var valid: Bool { start >= 0 && end <= 253_402_300_799_999 && start < end }
}

/// Contains no event titles, locations, attendees or external event identifiers.
struct BusyProjection: Codable, Equatable, Sendable {
    let covered: BusyInterval
    let intervals: [BusyInterval]

    func validated() throws -> Self {
        guard covered.valid, covered.end - covered.start <= 2_678_400_000, intervals.count <= 512 else {
            throw CalendarConsentError.invalid
        }
        var previous = covered.start - 1
        for interval in intervals {
            guard interval.valid, interval.start >= covered.start, interval.end <= covered.end,
                interval.start > previous
            else { throw CalendarConsentError.invalid }
            previous = interval.end
        }
        return self
    }
}

struct BusyEvent: Sendable {
    let calendarId: String
    let interval: BusyInterval
    let free: Bool
    let cancelled: Bool
    let declined: Bool
}

enum LocalAvailability: Equatable {
    case unknown
    case known(BusyProjection)

    static func project(
        events: [BusyEvent], selected: Set<String>, available: Set<String>,
        permission: Bool, covered: BusyInterval
    ) -> Self {
        guard permission, !selected.isEmpty, selected.isSubset(of: available), covered.valid,
            covered.end - covered.start <= 2_678_400_000
        else { return .unknown }
        var intervals: [BusyInterval] = []
        for event in events {
            guard selected.contains(event.calendarId), !event.free, !event.cancelled, !event.declined else { continue }
            guard event.interval.valid else { return .unknown }
            let clipped = BusyInterval(
                start: max(covered.start, event.interval.start), end: min(covered.end, event.interval.end))
            if clipped.start < clipped.end { intervals.append(clipped) }
        }
        let merged = merge(intervals)
        guard merged.count <= 512 else { return .unknown }
        return .known(BusyProjection(covered: covered, intervals: merged))
    }

    func state(for query: BusyInterval, capturedAt: Int64, now: Int64, maxAge: Int64) -> BusyState {
        guard case .known(let projection) = self, query.valid, capturedAt >= 0, now >= capturedAt,
            maxAge > 0, now - capturedAt < maxAge,
            query.start >= projection.covered.start, query.end <= projection.covered.end
        else { return .unknown }
        return projection.intervals.contains { $0.start < query.end && $0.end > query.start } ? .busy : .free
    }

    private static func merge(_ intervals: [BusyInterval]) -> [BusyInterval] {
        var merged: [BusyInterval] = []
        for interval in intervals.sorted(by: { $0.start < $1.start }) {
            if let previous = merged.last, interval.start <= previous.end {
                merged[merged.count - 1] = BusyInterval(start: previous.start, end: max(previous.end, interval.end))
            } else {
                merged.append(interval)
            }
        }
        return merged
    }
}

enum BusyState { case unknown, busy, free }
