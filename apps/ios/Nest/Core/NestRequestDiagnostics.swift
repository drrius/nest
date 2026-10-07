import Foundation
import OSLog

public enum NestRequestOutcome: String, Codable, Sendable {
    case success, configuration, transport, timeout, offline, cancelled, response, responseSize, http, decoding
    case householdIncomplete
    case streamIncomplete, streamFailure, streamAborted, consumerFailure

    static func transport(_ error: Error) -> Self {
        if error is CancellationError { return .cancelled }
        guard let error = error as? URLError else { return .transport }
        switch error.code {
        case .timedOut: return .timeout
        case .notConnectedToInternet, .networkConnectionLost: return .offline
        case .cancelled: return .cancelled
        default: return .transport
        }
    }
}

public struct NestRequestDiagnostic: Codable, Sendable {
    public let requestId: UUID
    public let traceparent: String
    public let startedAt: Date
    public let appVersion: String
    public let appBuild: String
    public let route: NestRequestRoute
    public let method: String
    public let durationMilliseconds: Int
    public let status: Int?
    public let outcome: NestRequestOutcome
}

struct NestRequestTrace {
    let requestId = UUID()
    let spanId = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased().prefix(16)
    let startedAt = Date()
    let startedUptime = ProcessInfo.processInfo.systemUptime

    var traceparent: String {
        let traceId = requestId.uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        return "00-\(traceId)-\(spanId)-00"
    }

    var durationMilliseconds: Int {
        Int(max(0, ProcessInfo.processInfo.systemUptime - startedUptime) * 1_000)
    }
}

public final class NestRequestDiagnostics: @unchecked Sendable {
    public static let shared = NestRequestDiagnostics()
    private static let logger = Logger(subsystem: "app.nest", category: "requests")
    private let lock = NSLock()
    private let capacity: Int
    private var records: [NestRequestDiagnostic] = []
    let appVersion: String
    let appBuild: String

    public init(capacity: Int = 128) {
        self.capacity = min(128, max(1, capacity))
        appVersion = Self.buildValue("CFBundleShortVersionString")
        appBuild = Self.buildValue("CFBundleVersion")
    }

    public func snapshot() -> [NestRequestDiagnostic] {
        lock.withLock { records }
    }

    public func clear() {
        lock.withLock { records.removeAll(keepingCapacity: true) }
    }

    public func supportReport() throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return String(decoding: try encoder.encode(snapshot()), as: UTF8.self)
    }

    func addHeaders(to request: inout URLRequest, trace: NestRequestTrace) {
        request.setValue(trace.requestId.uuidString.lowercased(), forHTTPHeaderField: "X-Nest-Request-ID")
        request.setValue(trace.traceparent, forHTTPHeaderField: "traceparent")
        request.setValue(appVersion, forHTTPHeaderField: "X-Nest-App-Version")
        request.setValue(appBuild, forHTTPHeaderField: "X-Nest-App-Build")
    }

    func record(
        _ trace: NestRequestTrace, route: NestRequestRoute, method: String, status: Int?, outcome: NestRequestOutcome
    ) {
        let record = NestRequestDiagnostic(
            requestId: trace.requestId, traceparent: trace.traceparent, startedAt: trace.startedAt,
            appVersion: appVersion, appBuild: appBuild, route: route, method: method,
            durationMilliseconds: trace.durationMilliseconds, status: status, outcome: outcome)
        lock.withLock {
            records.append(record)
            if records.count > capacity { records.removeFirst(records.count - capacity) }
        }
        Self.log(record)
    }

    private static func buildValue(_ key: String) -> String {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String,
            !value.isEmpty, value.count <= 32,
            value.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "0123456789.").contains($0) })
        else { return "unknown" }
        return value
    }

    private static func log(_ record: NestRequestDiagnostic) {
        logger.notice(
            "request=\(record.requestId.uuidString, privacy: .public) traceparent=\(record.traceparent, privacy: .public) route=\(record.route.rawValue, privacy: .public) method=\(record.method, privacy: .public) version=\(record.appVersion, privacy: .public) build=\(record.appBuild, privacy: .public) duration_ms=\(record.durationMilliseconds) status=\(record.status ?? 0) outcome=\(record.outcome.rawValue, privacy: .public)"
        )
    }
}
