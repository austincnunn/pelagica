/*
 * Jellyfin 10.9+ moved user-scoped routes off `/Users/{userId}/...`, and
 * @jellyfin/sdk only knows the new paths. Emby still serves the old ones, so
 * requests to an Emby server get their path rewritten here.
 *
 * Only routes Pelagica actually calls are listed. Item ids are hex GUIDs on
 * Jellyfin and integers on Emby, so `[0-9a-f-]+` never matches fixed segments
 * like `/Items/Filters` or `/Items/Latest`.
 */

const ID = '([0-9a-fA-F-]+)';

const ROUTES: {
    method?: string;
    pattern: RegExp;
    rewrite: (userId: string, id: string) => string;
}[] = [
    { pattern: /^\/UserItems\/Resume$/, rewrite: (u) => `/Users/${u}/Items/Resume` },
    { pattern: /^\/UserViews$/, rewrite: (u) => `/Users/${u}/Views` },
    { pattern: /^\/Users\/Me$/, rewrite: (u) => `/Users/${u}` },
    { pattern: /^\/Users\/Configuration$/, rewrite: (u) => `/Users/${u}/Configuration` },
    {
        pattern: new RegExp(`^/UserFavoriteItems/${ID}$`),
        rewrite: (u, id) => `/Users/${u}/FavoriteItems/${id}`,
    },
    {
        pattern: new RegExp(`^/UserPlayedItems/${ID}$`),
        rewrite: (u, id) => `/Users/${u}/PlayedItems/${id}`,
    },
    {
        pattern: new RegExp(`^/UserItems/${ID}/Rating$`),
        rewrite: (u, id) => `/Users/${u}/Items/${id}/Rating`,
    },
    {
        pattern: new RegExp(`^/Items/${ID}/LocalTrailers$`),
        rewrite: (u, id) => `/Users/${u}/Items/${id}/LocalTrailers`,
    },
    // Emby fails user filters like isFavorite on plain /Items (500) and omits user data there.
    { method: 'get', pattern: /^\/Items$/, rewrite: (u) => `/Users/${u}/Items` },
    // GET only: DELETE and POST /Items/{id} (delete, update metadata) exist on Emby as-is.
    {
        method: 'get',
        pattern: new RegExp(`^/Items/${ID}$`),
        rewrite: (u, id) => `/Users/${u}/Items/${id}`,
    },
];

/** Converts an ISO date to Emby's `DatePlayed` format, yyyyMMddHHmmss in UTC. */
export function toEmbyDate(iso: string): string {
    return new Date(iso).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/**
 * Returns the Emby path for a Jellyfin API path, or null if it needs no rewrite.
 * @param method The HTTP method.
 * @param path The path relative to the server base URL, e.g. `/UserViews`.
 * @param userId The id of the logged-in user.
 */
export function rewriteForEmby(method: string, path: string, userId: string): string | null {
    for (const route of ROUTES) {
        if (route.method && route.method !== method.toLowerCase()) continue;
        const match = route.pattern.exec(path);
        if (match) return route.rewrite(userId, match[1]);
    }
    return null;
}
