/**
 * profile.js — TruRent user profile storage helper
 *
 * Include with: <script src="profile.js"></script>
 * No dependencies — pure localStorage.
 *
 * All profile operations go through this module so the storage key
 * is always consistent and one user's data never overwrites another's.
 *
 * Key strategy: uses Auth0 `sub` (stable permanent ID) as primary key,
 * falls back to email, then 'demo@trurent.app' in demo mode.
 */
const TruRentProfile = (() => {

    function _key(user) {
        const id = user?.sub || user?.email || 'demo@trurent.app';
        return 'trurent_profile_' + id;
    }

    /** Load the saved profile for this user. Returns null if none exists. */
    function get(user) {
        try {
            const raw = localStorage.getItem(_key(user));
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    /**
     * Save (overwrite) the full profile for this user.
     * Automatically sets onboardedAt on first save, updatedAt on every save.
     */
    function save(user, data) {
        const now     = new Date().toISOString();
        const existing = get(user) || {};
        const profile  = { ...existing, ...data, updatedAt: now };
        if (!profile.onboardedAt) profile.onboardedAt = now;
        localStorage.setItem(_key(user), JSON.stringify(profile));
    }

    /** Erase all profile data for this user. Auth0 session is unaffected. */
    function clear(user) {
        localStorage.removeItem(_key(user));
    }

    /** Returns true if a saved profile exists for this user. */
    function exists(user) {
        return localStorage.getItem(_key(user)) !== null;
    }

    /**
     * Get the best display name for this user.
     * Priority: saved profile displayName → Auth0 user.name → email prefix → 'there'
     */
    function getDisplayName(user, profile) {
        const saved = profile?.displayName?.trim();
        if (saved) return saved;

        const auth0Name = user?.name || '';
        if (auth0Name && !auth0Name.includes('@')) return auth0Name.split(' ')[0];

        if (user?.email) return user.email.split('@')[0];
        return 'there';
    }

    /**
     * Get 1–2 letter initials for the avatar circle.
     * "Tony Zheng" → "TZ", "tony@gmail.com" → "T"
     */
    function getInitials(user, profile) {
        const name = (profile?.displayName || user?.name || '').trim();
        if (name && !name.includes('@')) {
            const parts = name.split(/\s+/);
            return parts.length >= 2
                ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                : name.slice(0, 2).toUpperCase();
        }
        const email = user?.email || '';
        return email ? email[0].toUpperCase() : '?';
    }

    return { get, save, clear, exists, getDisplayName, getInitials };

})();
