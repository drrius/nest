import Foundation

extension SessionModel {
    func readMemberColours(member: VerifiedMember) async throws -> MemberColoursEnvelope {
        let context = try setupContext(member: member)
        let (api, token) = try await memberColourAccess(context)
        let result = try await api.memberColours(token: token, member: member)
        try requireSetupAccount(context)
        return result
    }

    func saveMemberColour(_ colour: MemberColor, expected: String, member: VerifiedMember) async throws
        -> MemberColourReceipt
    {
        let context = try setupContext(member: member)
        let command = try SaveMemberColour(operationId: UUID(), expectedRevision: expected, colour: colour).validated()
        let (api, token) = try await memberColourAccess(context)
        let receipt = try await api.saveMemberColour(token: token, member: member, command: command)
        try requireSetupAccount(context)
        return receipt
    }

    private func memberColourAccess(_ context: SetupContext) async throws -> (SetupAPI, String) {
        try requireSetupAccount(context)
        guard let auth, let setupAPI else { throw NestAPIFailure.configuration }
        let session = try await auth.session()
        try requireSetupAccount(context)
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        return (setupAPI, session.accessToken)
    }
}
