import Foundation
import XCTest

@testable import Nest

@MainActor
final class NativePushDeviceTests: XCTestCase {
    func testPermissionRefusalAndSimulatorSupportNeverRegister() async throws {
        var asks = 0
        var registrations = 0
        let device = NativePushDevice(
            supported: true, permission: { .denied },
            requestPermission: {
                asks += 1
                return .allowed
            }, register: { registrations += 1 }, unregister: {})
        do {
            _ = try await device.requestPermission()
            XCTFail("Ignored refusal")
        } catch { XCTAssertEqual(error as? NativePushFailure, .permissionDenied) }
        XCTAssertEqual(asks, 0)
        XCTAssertEqual(registrations, 0)
        let simulator = NativePushDevice(
            supported: false, permission: { .notAsked },
            requestPermission: {
                asks += 1
                return .allowed
            }, register: { registrations += 1 }, unregister: {})
        do {
            _ = try await simulator.requestPermission()
            XCTFail("Asked on unsupported platform")
        } catch { XCTAssertEqual(error as? NativePushFailure, .unsupported) }
        do {
            _ = try await simulator.captureToken(request: UUID())
            XCTFail("Registered on unsupported platform")
        } catch { XCTAssertEqual(error as? NativePushFailure, .unsupported) }
        XCTAssertEqual(asks, 0)
        XCTAssertEqual(registrations, 0)
    }

    func testEachCaptureRequiresFreshCallbackAndKeepsLeadingZerosAndVariableLength() async throws {
        var device: NativePushDevice!
        var calls = 0
        let values = [Data([0, 1]), Data(repeating: 0, count: 64)]
        device = NativePushDevice(
            supported: true, permission: { .allowed }, requestPermission: { .allowed },
            register: {
                device.didRegister(values[calls])
                calls += 1
            }, unregister: {})
        for expected in values {
            let result = try await device.captureToken(request: UUID())
            XCTAssertEqual(result, expected)
        }
        XCTAssertEqual(calls, 2)
    }

    func testOverlappingCaptureAndWrongCancellationCannotConsumeAnotherRequest() async throws {
        let started = expectation(description: "Apple registration began")
        let device = NativePushDevice(
            supported: true, permission: { .allowed }, requestPermission: { .allowed },
            register: { started.fulfill() }, unregister: {})
        let id = UUID()
        let first = Task { try await device.captureToken(request: id) }
        await fulfillment(of: [started], timeout: 2)
        device.cancelTokenRequest(request: UUID())
        do {
            _ = try await device.captureToken(request: UUID())
            XCTFail("Overlapped capture")
        } catch { XCTAssertEqual(error as? NativePushFailure, .busy) }
        device.didRegister(Data([0, 2, 3]))
        let result = try await first.value
        XCTAssertEqual(result, Data([0, 2, 3]))
    }

    func testCancellationAndLateCallbacksDoNotCacheOrReuseToken() async throws {
        let started = expectation(description: "Registration began")
        let device = NativePushDevice(
            supported: true, permission: { .allowed }, requestPermission: { .allowed },
            register: { started.fulfill() }, unregister: {})
        let request = UUID()
        let task = Task { try await device.captureToken(request: request) }
        await fulfillment(of: [started], timeout: 2)
        task.cancel()
        do {
            _ = try await task.value
            XCTFail("Completed cancelled capture")
        } catch { XCTAssertTrue(error is CancellationError) }
        device.didRegister(Data([9, 9]))
        device.didFailRegistration()
        device.cancelTokenRequest(request: request)
    }

    func testTimeoutAndMalformedTokenHaveBoundedSanitizedFailures() async throws {
        let device = NativePushDevice(
            supported: true, timeout: .milliseconds(10), permission: { .allowed },
            requestPermission: { .allowed }, register: {}, unregister: {})
        do {
            _ = try await device.captureToken(request: UUID())
            XCTFail("Unbounded registration")
        } catch { XCTAssertEqual(error as? NativePushFailure, .timedOut) }
        device.didRegister(Data([9]))
        var invalid: NativePushDevice!
        invalid = NativePushDevice(
            supported: true, permission: { .allowed }, requestPermission: { .allowed },
            register: { invalid.didRegister(Data(repeating: 1, count: 2049)) }, unregister: {})
        do {
            _ = try await invalid.captureToken(request: UUID())
            XCTFail("Accepted oversized token")
        } catch { XCTAssertEqual(error as? NativePushFailure, .registrationFailed) }
    }

    func testRequestPointOfUseReadsFinalPermissionAndDoesNotUnregisterOnFailure() async throws {
        var permission = PushPermission.notAsked
        var asks = 0
        var removals = 0
        let device = NativePushDevice(
            supported: true, permission: { permission },
            requestPermission: {
                asks += 1
                permission = .quiet
                return permission
            }, register: {}, unregister: { removals += 1 })
        let before = await device.permission()
        let requested = try await device.requestPermission()
        let repeated = try await device.requestPermission()
        XCTAssertEqual(before, .notAsked)
        XCTAssertEqual(requested, .quiet)
        XCTAssertEqual(repeated, .quiet)
        XCTAssertEqual(asks, 1)
        XCTAssertEqual(removals, 0)
        device.disableLocalDelivery()
        XCTAssertEqual(removals, 1)
        let after = await device.permission()
        XCTAssertEqual(after, .quiet)
    }
}
