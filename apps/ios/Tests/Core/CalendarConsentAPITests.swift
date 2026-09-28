import Foundation
import XCTest

@testable import NestCore

final class CalendarConsentAPITests: XCTestCase {
    func testReadAndWriteUseAuthenticatedScopedRoutes() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = SetCalendarConsent(
            incarnation: UUID(), operationId: UUID(), expectedRevision: "0", enabled: true)
        let consent = CalendarConsent(incarnation: command.incarnation, version: "1", enabled: true)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test")
            XCTAssertEqual(
                request.value(forHTTPHeaderField: "X-Nest-Household"), member.householdId.uuidString.lowercased())
            let data: Data
            if request.httpMethod == "GET" {
                XCTAssertEqual(request.url?.path, "/v1/calendar/consent")
                XCTAssertNil(request.httpBody)
                data = try JSONEncoder().encode(
                    CalendarConsentEnvelope(
                        version: 1, actorId: member.userId, householdId: member.householdId, consent: consent))
            } else {
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.url?.path, "/v1/calendar/consent/set")
                XCTAssertEqual(try JSONDecoder().decode(SetCalendarConsent.self, from: request.httpBody!), command)
                data = try JSONEncoder().encode(
                    CalendarConsentReceipt(
                        version: 1, actorId: member.userId, householdId: member.householdId,
                        operationId: command.operationId, consent: consent))
            }
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let api = CalendarAPI(http: http)
        let read = try await api.consent(token: "test", member: member)
        XCTAssertEqual(read, consent)
        let written = try await api.setConsent(token: "test", member: member, command: command)
        XCTAssertEqual(written, consent)
    }
}
