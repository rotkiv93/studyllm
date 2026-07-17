/// Google OAuth client configuration. Google issues a client secret even for "Desktop app"
/// (installed-app) OAuth clients, but documents it as not needing to be kept confidential for
/// this client type — it's fine to embed in a distributed binary, unlike a server-side web-app
/// client secret. See PROJECT_STATUS.md's "Google Workspace" section for the registration steps.
///
/// Placeholders below make an unconfigured build fail loudly (`is_configured()`) instead of
/// silently sending garbage client credentials to Google.
pub const GOOGLE_OAUTH_CLIENT_ID: &str = "1052082533842-ra915nh39bgrpiq488agbpdhe0h51i90.apps.googleusercontent.com";
pub const GOOGLE_OAUTH_CLIENT_SECRET: &str = "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";

pub const GOOGLE_AUTHORIZE_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

pub fn is_configured() -> bool {
    GOOGLE_OAUTH_CLIENT_ID != "REPLACE_ME.apps.googleusercontent.com"
        && !GOOGLE_OAUTH_CLIENT_ID.is_empty()
}
