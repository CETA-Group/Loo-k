/**
 * auth.js — TruRent centralised Auth0 module
 *
 * Include this file via <script> on any page that needs authentication.
 * All Auth0 logic lives here. No other file should initialise Auth0 or
 * build a custom login form.
 *
 * Usage:
 *   await TruRentAuth.init()
 *   TruRentAuth.login()          // opens Auth0 Universal Login
 *   TruRentAuth.logout()
 *   await TruRentAuth.getUser()  // returns user object or null
 *   await TruRentAuth.handleCallback()  // call on page load to process redirect
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTH0 DASHBOARD SETUP (required before Auth0 will open)
 *
 *  1. Go to https://manage.auth0.com → Applications → Your SPA
 *  2. Fill in AUTH0_DOMAIN and AUTH0_CLIENT_ID below
 *  3. Add ALL of the following to Allowed Callback URLs, Allowed Logout URLs,
 *     and Allowed Web Origins:
 *
 *       http://localhost:8080                         ← local dev (python HTTP server)
 *       http://localhost:5173                         ← if using Vite
 *       https://your-deployed-site.github.io          ← production (update when deployed)
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

    // Pages to route to after authentication
    const PAGE_ONBOARDING = '/Auth0/onboarding.html';  // new user → collect preferences
    const PAGE_DASHBOARD  = '/Auth0/dashboard.html';   // existing user → app

    const REDIRECT_URI = window.location.href.split('?')[0].split('#')[0];
    const IS_CONFIGURED = AUTH0_DOMAIN !== 'YOUR_AUTH0_DOMAIN' && AUTH0_CLIENT_ID !== 'YOUR_CLIENT_ID';

    let client = null;

    /** Initialise the Auth0 client. Call once on page load. */
    async function init() {
        if (!IS_CONFIGURED) {
            console.info('[TruRentAuth] Auth0 not configured — running in demo mode.');
            return null;
        }
        client = await auth0.createAuth0Client({
            domain:           AUTH0_DOMAIN,
            clientId:         AUTH0_CLIENT_ID,
            authorizationParams: { 
                redirect_uri: REDIRECT_URI ,
                audience: AUTH0_AUDIENCE
            },
            cacheLocation:    'localstorage',  // persist session across page reloads
            useRefreshTokens: true
        });
        return client;
    }

    /**
     * Open Auth0 Universal Login.
     * Auth0 provides the entire email/password/social UI — never build it locally.
     * After the user authenticates, Auth0 redirects back to REDIRECT_URI.
     */
    function login() {
        if (client) {
            client.loginWithRedirect({
                authorizationParams: { redirect_uri: REDIRECT_URI }
            });
        } else {
            // Demo mode (credentials not configured yet)
            window.location.href = PAGE_ONBOARDING;
        }
    }

    /** Log out and return to the current page. */
    function logout() {
        if (client) {
            client.logout({ logoutParams: { returnTo: REDIRECT_URI } });
        } else {
            window.location.href = REDIRECT_URI;
        }
    }

    /**
     * Process the Auth0 redirect callback (?code=...&state=...).
     * Call this on every page load. Returns true if a callback was handled.
     * After handling, routes the user to onboarding (new) or dashboard (existing).
     */
    async function handleCallback() {
        if (!client) return false;
        if (!window.location.search.includes('code=') || !window.location.search.includes('state=')) {
            return false;
        }

        await client.handleRedirectCallback();
        window.history.replaceState({}, document.title, REDIRECT_URI); // clean URL

        const user = await client.getUser();
        if (!user) return false;

        // New-user check: no saved profile = first time through
        // TODO: swap for GET /api/profile once backend/main.py has a /profile endpoint
        const profileKey = 'trurent_profile_' + (user.email || user.sub);
        const isNew = localStorage.getItem(profileKey) === null;

        window.location.href = isNew ? PAGE_ONBOARDING : PAGE_DASHBOARD;
        return true;
    }

    /** Returns the authenticated user object, or null if not logged in. */
    async function getUser() {
        if (!client) return null;
        const isAuth = await client.isAuthenticated();
        return isAuth ? client.getUser() : null;
    }

    /** Returns true if the current session is authenticated. */
    async function isAuthenticated() {
        if (!client) return false;
        return client.isAuthenticated();
    }

    /** Returns an access token for API calls. */
    async function getToken() {
        if (!client) return null;
        try {
            return await client.getTokenSilently();
        } catch (err) {
            console.error('[TruRentAuth] Error getting token:', err);
            return null;
        }
    }

    return { init, login, logout, handleCallback, getUser, isAuthenticated, getToken, IS_CONFIGURED };

})();
