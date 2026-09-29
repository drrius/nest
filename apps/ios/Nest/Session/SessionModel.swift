import Auth
import Foundation
import SwiftUI
import UIKit

@MainActor
final class SessionModel: ObservableObject {
    @Published var status: Status = .loading
    @Published var today: TodayStatus = .idle
    @Published var todayNotice: String?
    @Published var groceries: GroceryStatus = .idle
    @Published var groceryNotice: String?
    @Published var groceryAdd: SavedGroceryAdd?
    @Published var groceryAddSaving = false
    @Published var groceryCategoryStatus: GroceryCategoryStatus = .idle
    @Published var groceryEdit: SavedGroceryEdit?
    @Published var groceryEditSaving = false
    @Published var groceryRemove: SavedGroceryRemove?
    @Published var groceryRemoveSaving = false
    @Published var mealSelection: MealWeekStart?
    @Published var mealStatus: MealStatus = .idle
    @Published var mealNotice: String?
    @Published var mealPlacement: SavedMealPlacement?
    @Published var mealPlacementSaving = false
    @Published var mealVisibleSlots = MealSlot.allCases
    @Published var mealSlotNotice: String?
    @Published var cookingProfile: CookingSlotsEnvelope?
    @Published var cookingPending: SavedCookingPreference?
    @Published var cookingNotice: String?
    @Published var cookingSaving = false
    var cookingSavingGeneration: Int?
    var cookingReadRequest: UUID?
    @Published var mealReplacement: SavedMealReplacement?
    @Published var mealReplacementSaving = false
    var mealReplacementSavingGeneration: Int?
    @Published var recipeEdit: SavedRecipeEdit?
    @Published var recipeEditSaving = false
    @Published var recipeEditNotice: String?
    var recipeEditSavingGeneration: Int?
    @Published var recipeArchive: SavedRecipeArchive?
    @Published var recipeArchiveSaving = false
    @Published var recipeArchiveNotice: String?
    var recipeArchiveSavingGeneration: Int?
    @Published var recipeCreation: SavedRecipeCreation?
    @Published var recipeCreationSaving = false
    @Published var recipeCreationNotice: String?
    var recipeCreationSavingGeneration: Int?
    @Published var mealLeftovers: SavedMealLeftovers?
    @Published var mealLeftoversSaving = false
    var mealLeftoversSavingGeneration: Int?
    @Published var mealMove: SavedMealMove?
    @Published var mealMoveSaving = false
    var mealMoveSavingGeneration: Int?
    @Published var mealRemoval: SavedMealRemoval?
    @Published var mealRemovalSaving = false
    @Published var mealLibrary: MealLibraryStatus = .idle
    @Published var mealLibraryNotice: String?
    @Published var plannedRecipe: PlannedRecipeStatus = .idle
    @Published var plannedRecipeNotice: String?
    @Published var plannedRecipeTarget: PlannedRecipeTarget?
    @Published var plannedRecipeFresh = false
    var plannedRecipeRequest: UUID?
    @Published var savedRecipe: SavedRecipeStatus = .idle
    var savedRecipeRevision: String?
    @Published var mealRecipePlacement: SavedMealRecipePlacement?
    @Published var mealRecipePlacementSaving = false
    let auth: (any NestAuthentication)?
    let chores: ChoreAPI?
    let groceryAPI: GroceryAPI?
    let mealAPI: MealAPI?
    let assistantAPI: AssistantAPI?
    let calendarAPI: CalendarAPI?
    let moneyAPI: MoneyAPI?
    let receiptTransport: ReceiptTransport?
    let proposalAPI: MealProposalAPI?
    let foodAPI: FoodAPI?
    let notificationAPI: NotificationAPI?
    let offline: ChoreOfflineStore?
    let savedReader: @Sendable (ChoreOfflineStore, OfflineLease) async throws -> ChoreOfflineState?
    private let deactivateLease: @Sendable (ChoreOfflineStore, OfflineLease) async throws -> Void
    var lease: OfflineLease?
    private var syncingGeneration: Int?
    var grocerySyncingGeneration: Int?
    var groceryNeedsRefresh = false
    var groceryAddSavingGeneration: Int?
    var groceryCategoryLoadingGeneration: Int?
    var groceryEditSavingGeneration: Int?
    var groceryRemoveSavingGeneration: Int?
    var mealLoadingRequest: UUID?
    var mealPlacementSavingGeneration: Int?
    var mealRemovalSavingGeneration: Int?
    var mealLibraryRequest: UUID?
    var savedRecipeRequest: UUID?
    var mealRecipePlacementSavingGeneration: Int?
    var generation = 0
    var credentialTail: Task<Void, Never>?
    var credentialSequence = 0

    init() {
        savedReader = { store, lease in try await store.read(lease) }
        deactivateLease = { store, lease in try await store.deactivate(lease) }
        do {
            let configuration = try NestConfiguration.fromBundle()
            let http = try NestHTTP(baseURL: configuration.apiURL)
            let store = try ChoreOfflineStore.application(environment: configuration.supabaseURL)
            let upload = try ReceiptTransport(
                origin: configuration.supabaseURL, publishableKey: configuration.publishableKey)
            auth = try NestAuth(configuration: configuration)
            chores = ChoreAPI(http: http)
            groceryAPI = GroceryAPI(http: http)
            mealAPI = MealAPI(http: http)
            assistantAPI = AssistantAPI(http: http)
            foodAPI = FoodAPI(http: http)
            notificationAPI = NotificationAPI(http: http)
            proposalAPI = MealProposalAPI(http: http)
            calendarAPI = CalendarAPI(http: http)
            moneyAPI = MoneyAPI(http: http, storageOrigin: configuration.supabaseURL)
            receiptTransport = upload
            offline = store
        } catch is NestConfigurationError {
            auth = nil
            chores = nil
            groceryAPI = nil
            mealAPI = nil
            assistantAPI = nil
            foodAPI = nil
            notificationAPI = nil
            proposalAPI = nil
            calendarAPI = nil
            moneyAPI = nil
            receiptTransport = nil
            offline = nil
            status = .configuration
        } catch {
            auth = nil
            chores = nil
            groceryAPI = nil
            mealAPI = nil
            assistantAPI = nil
            foodAPI = nil
            notificationAPI = nil
            proposalAPI = nil
            calendarAPI = nil
            moneyAPI = nil
            receiptTransport = nil
            offline = nil
            status = .unavailable
        }
    }

    init(
        auth: any NestAuthentication, chores: ChoreAPI, offline: ChoreOfflineStore,
        groceryAPI: GroceryAPI? = nil, mealAPI: MealAPI? = nil, foodAPI: FoodAPI? = nil,
        proposalAPI: MealProposalAPI? = nil, calendarAPI: CalendarAPI? = nil, moneyAPI: MoneyAPI? = nil,
        receiptTransport: ReceiptTransport? = nil, assistantAPI: AssistantAPI? = nil,
        notificationAPI: NotificationAPI? = nil,
        savedReader: @escaping @Sendable (ChoreOfflineStore, OfflineLease) async throws -> ChoreOfflineState? = {
            store, lease in try await store.read(lease)
        },
        deactivateLease: @escaping @Sendable (ChoreOfflineStore, OfflineLease) async throws -> Void = {
            store, lease in try await store.deactivate(lease)
        }
    ) {
        self.auth = auth
        self.chores = chores
        self.groceryAPI = groceryAPI
        self.mealAPI = mealAPI
        self.assistantAPI = assistantAPI
        self.foodAPI = foodAPI
        self.notificationAPI = notificationAPI
        self.proposalAPI = proposalAPI
        self.calendarAPI = calendarAPI
        self.moneyAPI = moneyAPI
        self.receiptTransport = receiptTransport
        self.offline = offline
        self.savedReader = savedReader
        self.deactivateLease = deactivateLease
    }

    func restore() async {
        guard let auth else { return }
        generation += 1
        let attempt = generation
        status = .loading
        let pendingMutation = credentialTail
        await pendingMutation?.value
        guard generation == attempt else { return }
        do {
            let session = try await auth.session()
            try await verify(session, attempt: attempt)
        } catch AuthError.sessionMissing {
            await missingSession(attempt: attempt)
        } catch {
            await failedRestore(error, auth: auth, attempt: attempt)
        }
    }

    private func missingSession(attempt: Int) async {
        guard generation == attempt else { return }
        await clearPresentation()
        guard generation == attempt else { return }
        status = .signedOut
    }

    private func failedRestore(_ error: Error, auth: any NestAuthentication, attempt: Int) async {
        guard generation == attempt else { return }
        if canShowCached(error), (try? await showCached(auth: auth, attempt: attempt)) == true {
            return
        }
        guard generation == attempt else { return }
        let next = state(for: error)
        if next == .signedOut || next == .notMember { await clearPresentation() }
        guard generation == attempt else { return }
        status = next
    }

    func signIn(idToken: String, nonce: String) async {
        guard let auth else { return }
        generation += 1
        let attempt = generation
        status = .loading
        await clearPresentation()
        guard generation == attempt else { return }
        do {
            let session = try await serializeCredentials {
                try await auth.signIn(appleIDToken: idToken, nonce: nonce)
            }
            try await verify(session, attempt: attempt)
        } catch {
            if generation == attempt { status = state(for: error) }
        }
    }

    func refreshToday() async {
        guard syncingGeneration != generation, let auth, let chores, let offline, let lease,
            case .ready(let member) = status
        else { return }
        let attempt = generation
        syncingGeneration = attempt
        defer { if syncingGeneration == attempt { syncingGeneration = nil } }
        let saved: ChoreOfflineState?
        do {
            saved = try await savedReader(offline, lease)
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            today = .failed
            todayNotice = "Could not read your saved chores."
            return
        }
        guard generation == attempt, status == .ready(member) else { return }
        today = saved.map(TodayStatus.loaded) ?? .loading
        do {
            try await syncToday(
                auth: auth, chores: chores, offline: offline,
                lease: lease, member: member, attempt: attempt)
        } catch {
            await handleTodayFailure(error, member: member, attempt: attempt)
        }
    }

    private func canShowCached(_ error: Error) -> Bool {
        (error as? NestAPIFailure) == .unavailable || error is URLError
    }

    private func showCached(auth: any NestAuthentication, attempt: Int) async throws -> Bool {
        guard let offline, let session = await auth.cachedSession(),
            let member = try await offline.cachedMember(actor: session.userId)
        else { return false }
        guard generation == attempt else { return false }
        await clearPresentation()
        guard generation == attempt else { return false }
        let cachedLease = try await offline.activate(member)
        guard let saved = try await offline.read(cachedLease), generation == attempt else {
            try await offline.deactivate(cachedLease)
            return false
        }
        lease = cachedLease
        today = .loaded(saved)
        todayNotice = "Showing saved chores. Changes will sync when online."
        status = .ready(member)
        return true
    }

    func clearPresentation() async {
        let previous = lease
        lease = nil
        today = .idle
        todayNotice = nil
        groceries = .idle
        groceryNotice = nil
        groceryAdd = nil
        groceryAddSaving = false
        groceryCategoryStatus = .idle
        groceryEdit = nil
        groceryEditSaving = false
        groceryRemove = nil
        groceryRemoveSaving = false
        clearMealPresentation()
        syncingGeneration = nil
        grocerySyncingGeneration = nil
        groceryNeedsRefresh = false
        groceryAddSavingGeneration = nil
        groceryCategoryLoadingGeneration = nil
        groceryEditSavingGeneration = nil
        groceryRemoveSavingGeneration = nil
        if let previous, let offline { try? await deactivateLease(offline, previous) }
    }

    private func syncToday(
        auth: any NestAuthentication, chores: ChoreAPI, offline: ChoreOfflineStore,
        lease: OfflineLease, member: VerifiedMember, attempt: Int
    ) async throws {
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        let (snapshot, conflicted) = try await ChoreSync(api: chores, store: offline)
            .replayAndRead(token: session.accessToken, member: member, lease: lease)
        guard generation == attempt, status == .ready(member) else { return }
        try await offline.save(snapshot, lease: lease)
        guard let saved = try await offline.read(lease),
            generation == attempt, status == .ready(member)
        else { return }
        today = .loaded(saved)
        todayNotice = conflicted ? "A saved change needs your review." : nil
    }

    private func handleTodayFailure(_ error: Error, member: VerifiedMember, attempt: Int) async {
        guard generation == attempt, status == .ready(member) else { return }
        let mapped = state(for: error)
        if mapped == .signedOut || mapped == .notMember {
            generation += 1
            let clearAttempt = generation
            await clearPresentation()
            guard generation == clearAttempt else { return }
            status = mapped
            return
        }
        if case .loaded = today {
            todayNotice =
                (error as? NestAPIFailure) == .forbidden
                ? "A saved change was refused. Your access may have changed; no change was discarded."
                : "Showing saved chores. Changes will sync when online."
        } else {
            today = .failed
            todayNotice = nil
        }
    }

    private func verify(_ session: AuthenticatedSession, attempt: Int) async throws {
        guard let chores, let offline else { throw NestAPIFailure.configuration }
        let member = try await chores.verify(token: session.accessToken, expectedActor: session.userId)
        guard generation == attempt else { return }
        await clearPresentation()
        guard generation == attempt else { return }
        let nextLease = try await offline.activate(member)
        guard generation == attempt else {
            try? await offline.deactivate(nextLease)
            return
        }
        lease = nextLease
        status = .ready(member)
        await refreshToday()
    }

}
