import Foundation

struct SetupContext {
    let member: VerifiedMember
    let generation: Int
}

extension SessionModel {
    func setupContext(member: VerifiedMember) throws -> SetupContext {
        guard status == .ready(member) else { throw NestAPIFailure.signedOut }
        return .init(member: member, generation: generation)
    }

    func requireSetupAccount(_ context: SetupContext) throws {
        guard generation == context.generation, status == .ready(context.member) else { throw NestAPIFailure.signedOut }
    }

    func readSetup(_ context: SetupContext) async throws -> SetupStatus {
        try requireSetupAccount(context)
        guard let auth, let setupAPI else { throw NestAPIFailure.configuration }
        let session = try await auth.session()
        try requireSetupAccount(context)
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        let result = try await setupAPI.read(token: session.accessToken, member: context.member)
        try requireSetupAccount(context)
        return result
    }
}
