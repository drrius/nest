import AuthenticationServices
import SwiftUI

struct AppleSignInView: View {
    @Environment(\.colorScheme) private var colorScheme
    @ObservedObject var model: SessionModel
    @State private var nonce: String?
    @State private var requestState: String?
    @State private var message: String?

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 40)
            NestArt(width: 250, left: MemberColor.lake.color, right: MemberColor.clay.color)
            Text("nest")
                .font(.system(size: 54, weight: .heavy, design: .rounded))
                .foregroundStyle(NestColor.accent)
                .padding(.top, 14)
                .accessibilityAddTraits(.isHeader)
                .accessibilityLabel("Nest")
            Text("A little less to remember.")
                .font(.title3.weight(.semibold)).foregroundStyle(NestColor.ink).padding(.top, 6)
            Text("Meals, chores and money, shared by two.")
                .font(.subheadline).foregroundStyle(NestColor.ink2).padding(.top, 4)
            Spacer(minLength: 32)
            if let message {
                Text(message).font(.footnote).foregroundStyle(NestColor.warn).multilineTextAlignment(.center)
                    .padding(.bottom, 12)
            }
            SignInWithAppleButton(.signIn, onRequest: prepare, onCompletion: finish)
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .frame(height: 56)
                .clipShape(Capsule())
            Text("Only for members of your household.")
                .font(.footnote).foregroundStyle(NestColor.ink3).padding(.top, 14)
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 24)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            RadialGradient(
                colors: [NestColor.card.opacity(0.7), NestColor.background], center: .init(x: 0.5, y: 0.3),
                startRadius: 20, endRadius: 420
            )
            .ignoresSafeArea())
    }

    private func prepare(_ request: ASAuthorizationAppleIDRequest) {
        do {
            let raw = try AppleNonce.generate()
            let state = UUID().uuidString
            nonce = raw
            requestState = state
            request.nonce = AppleNonce.hashed(raw)
            request.state = state
            request.requestedScopes = []
            message = nil
        } catch {
            nonce = nil
            requestState = nil
            message = "Apple sign-in is unavailable. Please try again."
        }
    }

    private func finish(_ result: Result<ASAuthorization, Error>) {
        defer {
            nonce = nil
            requestState = nil
        }
        guard case .success(let authorization) = result,
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            credential.state == requestState, let nonce,
            let bytes = credential.identityToken,
            let idToken = String(data: bytes, encoding: .utf8)
        else {
            if case .failure(let error) = result,
                (error as? ASAuthorizationError)?.code == .canceled
            {
                return
            }
            message = "Sign-in could not be verified. Please try again."
            return
        }
        Task { await model.signIn(idToken: idToken, nonce: nonce) }
    }
}
