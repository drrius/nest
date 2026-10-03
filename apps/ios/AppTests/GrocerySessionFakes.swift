import Foundation

@testable import Nest

actor FakeGroceryServer {
    private let actorA: UUID
    private let actorB: UUID
    private let household: UUID
    private let epoch = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
    private var offline = false
    private var checkedA = false
    private var versionA = "42"
    private var originalName = "Alex apples"
    private var originalRemoved = false
    private var loseNextAddResponse = false
    private var rejectNextAdd = false
    private var failNextAddedList = false
    private var membershipDenied = false
    private var categoriesRemoved = false
    private var added: AddGrocery?
    private var addAttempts: [UUID] = []
    private var loseNextEditResponse = false
    private var edited: EditGrocery?
    private var editAttempts: [UUID] = []
    private var rejectNextEdit = false
    private var failNextEditedList = false
    private var loseNextRemoveResponse = false
    private var removed: RemoveGrocery?
    private var removeAttempts: [UUID] = []
    private var rejectNextRemove = false
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
    func rejectAdd() { rejectNextAdd = true }
    func loseListAfterAdd() { failNextAddedList = true }
    func denyMembership() { membershipDenied = true }
    func removeCategories() { categoriesRemoved = true }
    func addOperations() -> [UUID] { addAttempts }
    func addedCategory() -> UUID? { added?.categoryId }
    func loseNextEdit() { loseNextEditResponse = true }
    func editOperations() -> [UUID] { editAttempts }
    func rejectEdit() { rejectNextEdit = true }
    func loseListAfterEdit() { failNextEditedList = true }
    func changeOriginal() {
        originalName = "Partner apples"
        versionA = "43"
    }
    func removeOriginal() { originalRemoved = true }
    func loseNextRemove() { loseNextRemoveResponse = true }
    func removeOperations() -> [UUID] { removeAttempts }
    func rejectRemove() { rejectNextRemove = true }
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
        if request.url?.path == "/v1/session" {
            if membershipDenied {
                return answer(request, data: Data("{\"error\":{\"code\":\"not_a_member\"}}".utf8), status: 403)
            }
            let name = actor == actorA ? "Alex" : "Sam"
            let body = """
                {"version":1,"member":{"userId":"\(actor)","householdId":"\(household)","displayName":"\(name)"}}
                """
            return answer(request, data: Data(body.utf8))
        }
        if request.url?.path == "/v1/groceries/check" { return try check(request, actor: actor) }
        if request.url?.path == "/v1/groceries/add" { return try add(request) }
        if request.url?.path == "/v1/groceries/edit" { return try edit(request) }
        if request.url?.path == "/v1/groceries/remove" { return try remove(request) }
        if request.url?.path == "/v1/groceries", added != nil, failNextAddedList {
            failNextAddedList = false
            throw URLError(.networkConnectionLost)
        }
        if request.url?.path == "/v1/groceries", edited != nil, failNextEditedList {
            failNextEditedList = false
            throw URLError(.networkConnectionLost)
        }
        if actor == actorA && pauseA {
            aWaiting = true
            aStarted?.resume()
            aStarted = nil
            await withCheckedContinuation { aResume = $0 }
        }
        let body: String
        if request.url?.path == "/v1/groceries/categories" {
            body = categories(for: actor)
        } else {
            body = try list(for: actor)
        }
        return answer(request, data: Data(body.utf8))
    }

    private func add(_ request: URLRequest) throws -> (Data, URLResponse) {
        let command = try JSONDecoder().decode(AddGrocery.self, from: request.httpBody ?? Data())
        addAttempts.append(command.operationId)
        if rejectNextAdd {
            rejectNextAdd = false
            return answer(request, data: Data("{\"error\":{\"code\":\"invalid_request\"}}".utf8), status: 400)
        }
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
        if actor == actorA {
            checkedA = command.checked
            versionA = String(Int64(command.expectedVersion)! + 1)
        }
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
        versionA = String(Int64(command.expectedVersion)! + 1)
        if loseNextEditResponse {
            loseNextEditResponse = false
            throw URLError(.networkConnectionLost)
        }
        let body = """
            {"version":1,"householdId":"\(household)","receipt":{"operation":"\(command.operationId)","target":"\(command.itemId)","version":"\(Int64(command.expectedVersion)! + 1)","checked":false,"removed":false}}
            """
        return answer(request, data: Data(body.utf8))
    }

    private func remove(_ request: URLRequest) throws -> (Data, URLResponse) {
        let command = try JSONDecoder().decode(RemoveGrocery.self, from: request.httpBody ?? Data())
        removeAttempts.append(command.operationId)
        if rejectNextRemove {
            rejectNextRemove = false
            return answer(request, data: Data("{\"error\":{\"code\":\"conflict\"}}".utf8), status: 409)
        }
        if let removed, removed != command { throw NestAPIFailure.invalid }
        removed = command
        if loseNextRemoveResponse {
            loseNextRemoveResponse = false
            throw URLError(.networkConnectionLost)
        }
        let body = """
            {"version":1,"householdId":"\(household)","receipt":{"operation":"\(command.operationId)","target":"\(command.itemId)","version":"43","checked":false,"removed":true}}
            """
        return answer(request, data: Data(body.utf8))
    }

    private func list(for actor: UUID) throws -> String {
        let isA = actor == actorA
        var rows: [GroceryItem] = []
        if !isA || (!originalRemoved && removed?.itemId != actorA) {
            rows.append(
                GroceryItem(
                    itemId: actor, name: isA ? edited?.name ?? originalName : "Sam pears",
                    quantity: isA ? edited?.quantity : nil, unit: isA ? edited?.unit : nil,
                    categoryId: isA ? edited?.categoryId : nil,
                    categoryName: isA && edited?.categoryId != nil ? "Alex produce" : nil,
                    version: isA ? versionA : "42", checked: isA && checkedA,
                    legacyClaimed: false, offlineEpoch: epoch, mealSource: nil))
        }
        if let added {
            rows.append(
                GroceryItem(
                    itemId: added.itemId, name: added.name, quantity: added.quantity, unit: added.unit,
                    categoryId: added.categoryId, categoryName: added.categoryId == nil ? nil : "Alex produce",
                    version: "1", checked: false, legacyClaimed: false, offlineEpoch: epoch, mealSource: nil))
        }
        let snapshot = GroceryList(version: 1, householdId: household, groceries: rows)
        return String(decoding: try JSONEncoder().encode(snapshot), as: UTF8.self)
    }

    private func categories(for actor: UUID) -> String {
        if categoriesRemoved {
            return "{\"version\":1,\"householdId\":\"\(household)\",\"categories\":[]}"
        }
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
