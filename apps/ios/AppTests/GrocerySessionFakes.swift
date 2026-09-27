import Foundation

@testable import Nest

actor FakeGroceryServer {
    private let actorA: UUID
    private let actorB: UUID
    private let household: UUID
    private let epoch = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
    private var offline = false
    private var checkedA = false
    private var loseNextAddResponse = false
    private var added: AddGrocery?
    private var addAttempts: [UUID] = []
    private var loseNextEditResponse = false
    private var edited: EditGrocery?
    private var editAttempts: [UUID] = []
    private var rejectNextEdit = false
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
    func loseNextAdd() { loseNextAddResponse = true }
    func addOperations() -> [UUID] { addAttempts }
    func addedCategory() -> UUID? { added?.categoryId }
    func loseNextEdit() { loseNextEditResponse = true }
    func editOperations() -> [UUID] { editAttempts }
    func rejectEdit() { rejectNextEdit = true }
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
        if request.url?.path == "/v1/groceries/add" { return try add(request) }
        if request.url?.path == "/v1/groceries/edit" { return try edit(request) }
        if actor == actorA && pauseA {
            aWaiting = true
            aStarted?.resume()
            aStarted = nil
            await withCheckedContinuation { aResume = $0 }
        }
        let body =
            request.url?.path == "/v1/groceries/categories"
            ? categories(for: actor) : list(for: actor)
        return answer(request, data: Data(body.utf8))
    }

    private func add(_ request: URLRequest) throws -> (Data, URLResponse) {
        let command = try JSONDecoder().decode(AddGrocery.self, from: request.httpBody ?? Data())
        addAttempts.append(command.operationId)
        if let added, added != command { throw NestAPIFailure.invalid }
        added = command
        if loseNextAddResponse {
            loseNextAddResponse = false
            throw URLError(.networkConnectionLost)
        }
        let body = """
            {"version":1,"householdId":"\(household)","receipt":{"operation":"\(command.operationId)","target":"\(command.itemId)","version":"1","checked":false,"removed":false}}
            """
        return answer(request, data: Data(body.utf8))
    }

    private func check(_ request: URLRequest, actor: UUID) throws -> (Data, URLResponse) {
        let command = try JSONDecoder().decode(CheckGrocery.self, from: request.httpBody ?? Data())
        if actor == actorA { checkedA = command.checked }
        let body = """
            {"version":1,"householdId":"\(household)","receipt":{"operation":"\(command.operationId)","target":"\(command.itemId)","version":"43","checked":\(command.checked),"outcome":"applied"}}
            """
        return answer(request, data: Data(body.utf8))
    }

    private func edit(_ request: URLRequest) throws -> (Data, URLResponse) {
        let command = try JSONDecoder().decode(EditGrocery.self, from: request.httpBody ?? Data())
        editAttempts.append(command.operationId)
        if rejectNextEdit {
            rejectNextEdit = false
            return answer(request, data: Data("{\"error\":{\"code\":\"conflict\"}}".utf8), status: 409)
        }
        if let edited, edited != command { throw NestAPIFailure.invalid }
        edited = command
        if loseNextEditResponse {
            loseNextEditResponse = false
            throw URLError(.networkConnectionLost)
        }
        let body = """
            {"version":1,"householdId":"\(household)","receipt":{"operation":"\(command.operationId)","target":"\(command.itemId)","version":"43","checked":false,"removed":false}}
            """
        return answer(request, data: Data(body.utf8))
    }

    private func list(for actor: UUID) -> String {
        let isA = actor == actorA
        let checked = isA && checkedA
        let version = checked || (isA && edited != nil) ? "43" : "42"
        let name = isA ? edited?.name ?? "Alex apples" : "Sam pears"
        let addedRow =
            added.map { command in
                ",{\"itemId\":\"\(command.itemId)\",\"name\":\"\(command.name)\",\"quantity\":null,\"unit\":null,\"categoryId\":null,\"categoryName\":null,\"version\":\"1\",\"checked\":false,\"legacyClaimed\":false,\"offlineEpoch\":\"\(epoch)\",\"mealSource\":null}"
            } ?? ""
        return """
            {"version":1,"householdId":"\(household)","groceries":[{"itemId":"\(actor)","name":"\(name)","quantity":null,"unit":null,"categoryId":null,"categoryName":null,"version":"\(version)","checked":\(checked),"legacyClaimed":false,"offlineEpoch":"\(epoch)","mealSource":null}\(addedRow)]}
            """
    }

    private func categories(for actor: UUID) -> String {
        let name = actor == actorA ? "Alex produce" : "Sam pantry"
        return """
            {"version":1,"householdId":"\(household)","categories":[{"categoryId":"\(actor)","name":"\(name)"}]}
            """
    }

    private func answer(_ request: URLRequest, data: Data, status: Int = 200) -> (Data, URLResponse) {
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, response)
    }
}
