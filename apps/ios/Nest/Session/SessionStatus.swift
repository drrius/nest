import Foundation

extension SessionModel {
    enum Status: Equatable {
        case configuration, loading, signedOut, notMember, unavailable
        case ready(VerifiedMember)
    }

    enum TodayStatus: Equatable {
        case idle, loading
        case loaded(ChoreOfflineState)
        case failed
    }

    enum GroceryStatus: Equatable {
        case idle, loading
        case loaded(GroceryOfflineState)
        case failed
    }

    enum GroceryCategoryStatus: Equatable {
        case idle, loading
        case loaded([GroceryCategory])
        case failed
    }

}
