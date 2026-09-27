import Foundation
import SQLite3

enum OfflineFailure: Error, Equatable {
    case storage, sessionChanged, missingSnapshot, alreadyQueued, queueFull, invalidOperation
}

final class SQLiteConnection {
    private var handle: OpaquePointer?

    init(url: URL) throws {
        let flags = SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(url.path, &handle, flags, nil) == SQLITE_OK else {
            sqlite3_close(handle)
            throw OfflineFailure.storage
        }
        do {
            let mode = try rows("PRAGMA journal_mode=DELETE")
            guard mode.first?.first == "delete" else { throw OfflineFailure.storage }
            try run("PRAGMA foreign_keys=ON")
        } catch {
            sqlite3_close(handle)
            throw error
        }
    }

    deinit { sqlite3_close(handle) }

    func run(_ sql: String, _ values: [String] = []) throws {
        let statement = try prepare(sql, values)
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw OfflineFailure.storage }
    }

    func rows(_ sql: String, _ values: [String] = []) throws -> [[String]] {
        let statement = try prepare(sql, values)
        defer { sqlite3_finalize(statement) }
        var result: [[String]] = []
        while true {
            let status = sqlite3_step(statement)
            if status == SQLITE_DONE { return result }
            guard status == SQLITE_ROW else { throw OfflineFailure.storage }
            result.append(
                (0..<sqlite3_column_count(statement)).map { index in
                    sqlite3_column_text(statement, index).map { String(cString: $0) } ?? ""
                })
        }
    }

    func transaction<Value>(_ work: () throws -> Value) throws -> Value {
        try run("BEGIN IMMEDIATE")
        do {
            let result = try work()
            try run("COMMIT")
            return result
        } catch {
            try? run("ROLLBACK")
            throw error
        }
    }

    private func prepare(_ sql: String, _ values: [String]) throws -> OpaquePointer? {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &statement, nil) == SQLITE_OK else {
            throw OfflineFailure.storage
        }
        do {
            guard sqlite3_bind_parameter_count(statement) == values.count else {
                throw OfflineFailure.storage
            }
            let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
            for (offset, value) in values.enumerated() {
                let status = value.withCString {
                    sqlite3_bind_text(statement, Int32(offset + 1), $0, -1, transient)
                }
                guard status == SQLITE_OK else { throw OfflineFailure.storage }
            }
            return statement
        } catch {
            sqlite3_finalize(statement)
            throw error
        }
    }
}
