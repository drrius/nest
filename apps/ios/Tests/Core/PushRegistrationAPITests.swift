import Foundation
import XCTest

@testable import NestCore

final class PushRegistrationAPITests: XCTestCase {
    private typealias F = PushRegistrationFixtures

    func testAPIUsesOnlyAuthenticatedOwnHouseholdAndExactAPNsWire() async throws {
        let receipt = try F.receipt()
        let state = try F.replace(
            F.baseline,
            patch: [
                "revision": receipt.revision.uuidString, "enabled": true, "provider": "apns", "environment": "sandbox",
            ])
        let recorded = try F.recovery(.recorded)
        let http = try NestHTTP(baseURL: URL(string: "https://api.example.test")!) { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer fictional-only")
            XCTAssertEqual(
                request.value(forHTTPHeaderField: "X-Nest-Household"), F.member.householdId.uuidString.lowercased())
            let path = request.url!.path
            let data: Data
            switch path {
            case "/v1/push-devices/save":
                XCTAssertEqual(request.httpMethod, "POST")
                let command = try JSONDecoder().decode(PushDeviceCommand.self, from: request.httpBody!)
                XCTAssertEqual(command, F.command)
                data = try JSONEncoder().encode(receipt)
            case "/v1/push-devices/detail":
                XCTAssertEqual(request.httpMethod, "GET")
                XCTAssertNil(request.httpBody)
                XCTAssertEqual(request.url!.query, "installationId=\(F.command.installationId.uuidString.lowercased())")
                data = try JSONEncoder().encode(state)
            case "/v1/push-devices/operation":
                XCTAssertEqual(request.httpMethod, "GET")
                XCTAssertEqual(request.url!.query, "operationId=\(F.command.operationId.uuidString.lowercased())")
                data = try JSONEncoder().encode(recorded)
            case "/v1/push-devices/cancel":
                XCTAssertEqual(request.httpMethod, "POST")
                let object = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
                XCTAssertEqual(object.count, 1)
                XCTAssertEqual(UUID(uuidString: object["operationId"]!), F.command.operationId)
                data = try JSONEncoder().encode(recorded)
            default: throw NestAPIFailure.contract
            }
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let api = NotificationAPI(http: http)
        let saved = try await api.savePushDevice(token: "fictional-only", member: F.member, command: F.command)
        XCTAssertEqual(saved, receipt)
        let detail = try await api.pushDevice(
            token: "fictional-only", member: F.member, installation: F.command.installationId)
        XCTAssertEqual(detail, state)
        for cancel in [false, true] {
            let result = try await api.recoverPushDevice(
                token: "fictional-only", member: F.member, command: F.command, cancel: cancel)
            XCTAssertEqual(result, recorded)
        }
    }

    func testForeignReceiptAndUnresolvedCancellationAreRefused() async throws {
        let wrong = try F.replace(F.receipt(), patch: ["actorId": F.id(2).uuidString])
        let http = try NestHTTP(baseURL: URL(string: "https://api.example.test")!) { request in
            let data =
                request.url!.path.hasSuffix("save")
                ? try JSONEncoder().encode(wrong) : try JSONEncoder().encode(F.recovery(.unresolved))
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let api = NotificationAPI(http: http)
        do {
            _ = try await api.savePushDevice(token: "fictional", member: F.member, command: F.command)
            XCTFail("Accepted foreign receipt")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .contract) }
        do {
            _ = try await api.recoverPushDevice(token: "fictional", member: F.member, command: F.command, cancel: true)
            XCTFail("Claimed cancellation without evidence")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .contract) }
    }
}
