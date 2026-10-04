import AuthenticationServices
import SwiftUI

struct AppleSignInView: View {
    @Environment(\.colorScheme) private var colorScheme
    @ObservedObject var model: SessionModel
    @State private var nonce: String?
    @State private var requestState: String?
    @State private var message: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Nest").font(.largeTitle.weight(.semibold))
                Text("A little less to remember.")
                    .font(.title2.weight(.semibold))
                Text("One place for your household’s day, meals and shared expenses.")
                    .foregroundStyle(QuietPalette.muted)
                if let message { Text(message).foregroundStyle(QuietPalette.muted) }
                SignInWithAppleButton(.signIn, onRequest: prepare, onCompletion: finish)
                    .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                    .frame(height: 50)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.top, 18)
            }
            .foregroundStyle(QuietPalette.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
            .padding(.top, 80)
            .padding(.bottom, 24)
        }
        .clipped()
        .background(QuietPalette.background)
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
