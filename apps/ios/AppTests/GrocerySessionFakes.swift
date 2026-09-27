import Foundation

@testable import Nest

actor FakeGroceryServer {
    private let actorA: UUID
    private let actorB: UUID
    private let household: UUID
    private let epoch = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
    private var offline = false
    private var checkedA = false
    private var pauseA = false
    private var aWaiting = false
    private var aStarted: CheckedContinuation<Void, Never>?
    private var aResume: CheckedContinuation<Void, Never>?

    init(actorA: UUID, actorB: UUID, household: UUID) {
        self.actorA = actorA
        self.actorB = actorB
        self.household = household
    }

    func setOffline(_ value: Bool) { offline = value }
    func pauseActorA() { pauseA = true }

    func waitForActorA() async {
        if aWaiting { return }
        await withCheckedContinuation { aStarted = $0 }
    }

    func releaseActorA() {
        pauseA = false
        aResume?.resume()
        aResume = nil
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        if offline { throw URLError(.notConnectedToInternet) }
        let token = request.value(forHTTPHeaderField: "Authorization") ?? ""
        let actor = token == "Bearer token-A" ? actorA : actorB
        if request.url?.path == "/v1/groceries/check" { return try check(request, actor: actor) }
        if actor == actorA && pauseA {
            aWaiting = true
            aStarted?.resume()
            aStarted = nil
            await withCheckedContinuation { aResume = $0 }
        }
        return answer(request, data: Data(list(for: actor).utf8))
    }

    private func check(_ request: URLRequest, actor: UUID) throws -> (Data, URLResponse) {
        let command = try JSONDecoder().decode(CheckGrocery.self, from: request.httpBody ?? Data())
        if actor == actorA { checkedA = command.checked }
        let body = """
            {"version":1,"householdId":"\(household)","receipt":{"operation":"\(command.operationId)","target":"\(command.itemId)","version":"43","checked":\(command.checked),"outcome":"applied"}}
            """
        return answer(request, data: Data(body.utf8))
    }

    private func list(for actor: UUID) -> String {
        let isA = actor == actorA
        let checked = isA && checkedA
        let version = checked ? "43" : "42"
        let name = isA ? "Alex apples" : "Sam pears"
        return """
            {"version":1,"householdId":"\(household)","groceries":[{"itemId":"\(actor)","name":"\(name)","quantity":null,"unit":null,"categoryId":null,"categoryName":null,"version":"\(version)","checked":\(checked),"legacyClaimed":false,"offlineEpoch":"\(epoch)","mealSource":null}]}
            """
    }

    private func answer(_ request: URLRequest, data: Data) -> (Data, URLResponse) {
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        return (data, response)
    }
}
