import Foundation

struct NestConfiguration: Sendable {
    let apiURL: URL
    let supabaseURL: URL
    let publishableKey: String
    let pushEnabled: Bool

    init(apiURL: String, supabaseURL: String, publishableKey: String, pushEnabled: Bool = false) throws {
        guard let api = URL(string: apiURL), Self.valid(api),
            let supabase = URL(string: supabaseURL), Self.valid(supabase),
            publishableKey.hasPrefix("sb_publishable_")
        else { throw NestConfigurationError.invalid }
        self.apiURL = api
        self.supabaseURL = supabase
        self.publishableKey = publishableKey
        self.pushEnabled = pushEnabled
    }

    static func fromBundle(_ bundle: Bundle = .main) throws -> Self {
        try Self(
            apiURL: bundle.object(forInfoDictionaryKey: "NEST_API_URL") as? String ?? "",
            supabaseURL: bundle.object(forInfoDictionaryKey: "NEST_SUPABASE_URL") as? String ?? "",
            publishableKey: bundle.object(forInfoDictionaryKey: "NEST_SUPABASE_PUBLISHABLE_KEY") as? String ?? "",
            pushEnabled: bundle.object(forInfoDictionaryKey: "NEST_PUSH_ENABLED") as? String == "true"
        )
    }

    private static func valid(_ url: URL) -> Bool {
        url.scheme == "https" && url.host != nil && url.user == nil && url.password == nil
            && url.query == nil && url.fragment == nil && (url.path.isEmpty || url.path == "/")
    }
}

enum NestConfigurationError: Error { case invalid }
