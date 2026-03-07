/**
 * auth.js — TruRent centralised Auth0 module
 *
 * Include this file via <script> on any page that needs authentication.
 * All Auth0 logic lives here. No other file should initialise Auth0 or
 * build a custom login form.
 *
 * Usage:
 *   await TruRentAuth.init()
 *   TruRentAuth.login()             // opens Auth0 Universal Login (sign in tab)
 *   TruRentAuth.signup()            // opens Auth0 Universal Login (sign up tab)
 *   TruRentAuth.logout()            // log out → landing page
 *   TruRentAuth.switchAccount()     // log out with federated clear → landing page
 *   await TruRentAuth.getUser()     // returns Auth0 user object or null
 *   await TruRentAuth.handleCallback()  // call on page load to process redirect
 *   TruRentAuth.client              // raw Auth0 SPA client (for getTokenSilently etc.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTH0 DASHBOARD SETUP (required before Auth0 will open)
 *
 *  1. Go to https://manage.auth0.com → Applications → Your SPA
 *  2. Fill in AUTH0_DOMAIN and AUTH0_CLIENT_ID below
 *  3. Add ALL of the following to Allowed Callback URLs, Allowed Logout URLs,
 *     and Allowed Web Origins:
 *
 *       http://localhost:8080/Portal%20website/index.html  ← local dev callback
 *       http://localhost:8080                              ← web origin
 *
 *  If Allowed Callback URLs is missing, Auth0 will never open — it silently
 *  aborts the redirect. This is the #1 cause of "Auth0 appears skipped".
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TruRentAuth = (() => {

    // ── FILL THESE IN ──────────────────────────────────────────────────────────
    const AUTH0_DOMAIN    = 'dev-s6ofaf4udt2w1nw1.us.auth0.com';
    const AUTH0_CLIENT_ID = 'aMvSv7X3MtUa1zF0TgF31E5jg5cRnxbx';
    const AUTH0_AUDIENCE  = 'https://trurent/api';
    // ──────────────────────────────────────────────────────────────────────────

    const PAGE_LANDING    = '/Portal%20website/index.html';
    const PAGE_ONBOARDING = '/Portal%20website/Auth0/onboarding.html';
    const PAGE_DASHBOARD  = '/Portal%20website/Auth0/dashboard.html';

    const REDIRECT_URI  = window.location.href.split('?')[0].split('#')[0];
    const IS_CONFIGURED = AUTH0_DOMAIN !== 'YOUR_AUTH0_DOMAIN' && AUTH0_CLIENT_ID !== 'YOUR_CLIENT_ID';

    let _client = null;

    /** Initialise the Auth0 SPA client. Call once per page load. */
    async function init() {
        if (!IS_CONFIGURED) {
            console.info('[TruRentAuth] Not configured — demo mode.');
            return null;
        }
        _client = await auth0.createAuth0Client({
            domain:   AUTH0_DOMAIN,
            clientId: AUTH0_CLIENT_ID,
            authorizationParams: {
                redirect_uri: REDIRECT_URI,
                // audience omitted here — only needed when calling the backend API
            },
            cacheLocation:    'localstorage',
            useRefreshTokens: true,
        });
        return _client;
    }

    /**
     * Open Auth0 Universal Login (sign-in view).
     * Auth0 provides the entire UI — never build a custom login form.
     */
    function login() {
        if (_client) {
            _client.loginWithRedirect({
                authorizationParams: {
                    redirect_uri: REDIRECT_URI,
                    prompt: 'login',  // always show login form, never silently skip
                },
            });
        } else {
            window.location.href = PAGE_ONBOARDING;
        }
    }

    /** Open Auth0 Universal Login pre-set to the sign-up tab. */
    function signup() {
        if (_client) {
            _client.loginWithRedirect({
                authorizationParams: {
                    redirect_uri: REDIRECT_URI,
                    screen_hint:  'signup',
                    prompt:       'login',
                },
            });
        } else {
            window.location.href = PAGE_ONBOARDING;
        }
    }

    /**
     * Log out and return to the landing page.
     * Auth0 session is cleared; the user will need to log in again.
     */
    function logout() {
        const returnTo = window.location.origin + PAGE_LANDING;
        if (_client) {
            _client.logout({ logoutParams: { returnTo } });
        } else {
            window.location.href = PAGE_LANDING;
        }
    }

    /**
     * Switch to a different account.
     * Same as logout but passes federated:true to also clear the identity
     * provider session (Google, GitHub, etc.) so the user must pick an account.
     */
    function switchAccount() {
        const returnTo = window.location.origin + PAGE_LANDING;
        if (_client) {
            _client.logout({ logoutParams: { returnTo, federated: true } });
        } else {
            window.location.href = PAGE_LANDING;
        }
    }

    /**
     * Process the Auth0 redirect callback (?code=...&state=...).
     * Call on every page load. Routes the user after successful authentication:
     *   - no saved profile  → onboarding form
     *   - profile exists    → dashboard
     */
    async function handleCallback() {
        if (!_client) return false;
        if (!window.location.search.includes('code=') || !window.location.search.includes('state=')) {
            return false;
        }

        await _client.handleRedirectCallback();
        window.history.replaceState({}, document.title, REDIRECT_URI);

        const user = await _client.getUser();
        if (!user) return false;

        // Use sub (stable permanent Auth0 ID) as the profile key
        const profileKey = 'trurent_profile_' + (user.sub || user.email);
        const hasProfile = localStorage.getItem(profileKey) !== null;

        window.location.href = hasProfile ? PAGE_DASHBOARD : PAGE_ONBOARDING;
        return true;
    }

    /** Returns the Auth0 user object, or null if not authenticated. */
    async function getUser() {
        if (!_client) return null;
        return (await _client.isAuthenticated()) ? _client.getUser() : null;
    }

    /** Returns true if the current session is authenticated. */
    async function isAuthenticated() {
        if (!_client) return false;
        return _client.isAuthenticated();
    }

    /** Returns an access token for backend API calls. */
    async function getToken() {
        if (!_client) return null;
        try {
            return await _client.getTokenSilently();
        } catch (err) {
            console.error('[TruRentAuth] Error getting token:', err);
            return null;
        }
    }

    return {
        init, login, signup, logout, switchAccount,
        handleCallback, getUser, isAuthenticated, getToken,
        IS_CONFIGURED,
        /** Raw Auth0 SPA client — use for getTokenSilently(), etc. */
        get client() { return _client; },
    };

})();
