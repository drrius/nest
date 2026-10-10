import Foundation
import XCTest

@testable import Nest

struct NativeVariableRaceSetup: Decodable, Sendable {
    let actor: UUID
    let partner: UUID
    let household: UUID
    let bearer: String
    let input: VariableCycleInput
}

@MainActor
struct NativeVariableRaceFixture {
    let origin: URL

    init() throws {
        #if !targetEnvironment(simulator)
            throw XCTSkip("Controlled race fixtures are forbidden on physical phones")
        #else
            guard let value = ProcessInfo.processInfo.environment["NEST_QA_LOCAL_VARIABLE_RACE"],
                let url = URL(string: value)
            else { throw XCTSkip("Requires the owned local native/API/PostgreSQL race fixture") }
            guard url.scheme == "http", url.host == "localhost", url.port != nil,
                url.path.isEmpty, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil
            else { throw NestAPIFailure.configuration }
            origin = url
        #endif
    }

    func setup(_ first: String) async throws -> NativeVariableRaceSetup {
        let (data, response) = try await URLSession.shared.data(from: origin.appending(path: "control/setup/\(first)"))
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw NestAPIFailure.contract }
        return try JSONDecoder().decode(NativeVariableRaceSetup.self, from: data)
    }

    func control(_ action: String) async throws -> [String: Any] {
        let (data, response) = try await URLSession.shared.data(from: origin.appending(path: "control/\(action)"))
        guard (response as? HTTPURLResponse)?.statusCode == 200,
            let result = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { throw NestAPIFailure.contract }
        return result
    }

    func wait(_ key: String) async throws {
        for _ in 0..<50 {
            let state = try await control("state")
            if (state[key] as? Bool) == true || (state[key] as? Int ?? 0) > 0 { return }
            try await Task.sleep(for: .milliseconds(20))
        }
        throw NestAPIFailure.unavailable
    }

    @MainActor
    func model(_ setup: NativeVariableRaceSetup, url: URL) throws -> SessionModel {
        let auth = FakeAuthentication(active: .init(userId: setup.actor, accessToken: setup.bearer))
        let chores = FakeChoreServer(actorA: setup.actor, actorB: setup.partner, household: setup.household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://fixture.invalid")!) { request in
            var controlled = request
            controlled.setValue("Bearer token-A", forHTTPHeaderField: "Authorization")
            return try await chores.respond(controlled)
        }
        let local = origin
        let moneyHTTP = try NestHTTP(baseURL: URL(string: "https://fixture.invalid")!) { request in
            var forwarded = request
            var address = URLComponents(url: local, resolvingAgainstBaseURL: false)!
            address.path = request.url!.path
            address.query = request.url!.query
            forwarded.url = address.url!
            return try await URLSession.shared.data(for: forwarded)
        }
        return SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: moneyHTTP))
    }
}
