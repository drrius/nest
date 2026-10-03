import SwiftUI

struct LegacyDecisionRecoverySection: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @ObservedObject var model: LegacyDecisionRecoveryModel

    var body: some View {
        Group {
            if session.status == .ready(member),
                model.adoption != nil || model.confirmation != nil || model.dismissal != nil || model.notice != nil
            {
                Section("Saved recurring decisions") {
                    if let saved = model.adoption {
                        NavigationLink("Check rule adoption decision") {
                            LegacyAdoptionApprovalScreen(
                                session: session, member: member, approvalId: saved.decision.approvalId
                            )
                            .id(session.generation)
                        }
                    }
                    if let saved = model.confirmation {
                        NavigationLink("Check draft expense decision") {
                            LegacyConfirmationApprovalScreen(
                                session: session, member: member, approvalId: saved.decision.approvalId
                            ).id(session.generation)
                        }
                    }
                    if let saved = model.dismissal {
                        NavigationLink("Check draft dismissal decision") {
                            LegacyDismissalApprovalScreen(
                                session: session, member: member, approvalId: saved.decision.approvalId
                            ).id(session.generation)
                        }
                    }
                    if let notice = model.notice { Text(notice) }
                    Button("Check saved recurring decisions") { Task { await model.load() } }.disabled(model.working)
                }
            }
        }
    }
}
