import Foundation

struct MoneyDetail: Codable, Sendable {
    struct Share: Codable, Identifiable, Sendable {
        let memberId: UUID
        let allocatedCentimes: Centimes?
        let deltaCentimes: Centimes
        var id: UUID { memberId }
    }
    struct Category: Codable, Sendable {
        let id: UUID
        let name: String
    }
    let version: Int
    let householdId: UUID
    let event: MoneyEventSummary
    let receiptTotalCentimes: Centimes?
    let note: String?
    let category: Category?
    let reversedById: UUID?
    let shares: [Share]

    func validated(member: VerifiedMember, eventId: UUID) throws -> Self {
        guard version == 1, householdId == member.householdId, event.id == eventId, event.valid,
            shares.count == 2, shares[0].id != shares[1].id,
            shares.contains(where: { $0.id == member.userId }),
            shares.contains(where: { $0.id == event.createdBy }),
            shares[0].deltaCentimes.value + shares[1].deltaCentimes.value == 0,
            shares.allSatisfy({ ($0.allocatedCentimes?.value ?? 0) >= 0 }),
            (note?.utf16.count ?? 0) <= 8000, reversedById != eventId, validCategory, validReceipt, validEntries
        else { throw NestAPIFailure.contract }
        return self
    }

    private var validCategory: Bool {
        guard let category else { return true }
        return !category.name.isEmpty && category.name.utf16.count <= 160
    }

    private var validReceipt: Bool {
        guard let total = receiptTotalCentimes else { return true }
        return (event.kind == .expense || event.kind == .replacement) && total.value >= event.amountCentimes.value
    }

    private var validEntries: Bool {
        if event.kind == .reversal {
            return reversedById == nil && shares.allSatisfy { $0.allocatedCentimes == nil }
        }
        guard let payer = shares.first(where: { $0.id == event.payerId }) else { return false }
        if event.kind == .opening_balance || event.kind == .settlement {
            return shares.allSatisfy { $0.allocatedCentimes == nil } && payer.deltaCentimes == event.amountCentimes
        }
        guard shares.allSatisfy({ $0.allocatedCentimes != nil }),
            shares.reduce(Int64(0), { $0 + ($1.allocatedCentimes?.value ?? 0) }) == event.amountCentimes.value,
            let allocation = payer.allocatedCentimes
        else { return false }
        let sign: Int64 = event.kind == .refund ? -1 : 1
        return payer.deltaCentimes.value == sign * (event.amountCentimes.value - allocation.value)
    }
}

extension MoneyAPI {
    func detail(token: String, member: VerifiedMember, eventId: UUID) async throws -> MoneyDetail {
        let result = try await http.read(
            "v1/money/detail?eventId=\(eventId.uuidString.lowercased())", token: token,
            household: member.householdId, as: MoneyDetail.self)
        return try result.validated(member: member, eventId: eventId)
    }
}
