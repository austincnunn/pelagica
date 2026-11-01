const STORAGE_SERVER_KEY = 'jf_server';
const STORAGE_USER_KEY = 'jf_user';
const STORAGE_TOKEN_KEY = 'jf_token';
const STORAGE_SERVER_TYPE_KEY = 'jf_server_type';

export type ServerType = 'jellyfin' | 'emby';

export function getServerUrl(): string | null {
    return localStorage.getItem(STORAGE_SERVER_KEY);
}

export function saveServerUrl(serverUrl: string): void {
    localStorage.setItem(STORAGE_SERVER_KEY, serverUrl);
}

export function getUserId(): string | null {
    return localStorage.getItem(STORAGE_USER_KEY);
}

export function getAccessToken(): string | null {
    return localStorage.getItem(STORAGE_TOKEN_KEY);
}

// Sessions saved before Emby support have no stored type and are Jellyfin.
export function getServerType(): ServerType {
    return localStorage.getItem(STORAGE_SERVER_TYPE_KEY) === 'emby' ? 'emby' : 'jellyfin';
}

export function saveCredentials(
    serverUrl: string,
    userId: string,
    accessToken: string,
    serverType: ServerType = 'jellyfin'
): void {
    localStorage.setItem(STORAGE_SERVER_KEY, serverUrl);
    localStorage.setItem(STORAGE_USER_KEY, userId);
    localStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
    localStorage.setItem(STORAGE_SERVER_TYPE_KEY, serverType);
}

export function clearCredentials(): void {
    localStorage.removeItem(STORAGE_SERVER_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_SERVER_TYPE_KEY);
}
