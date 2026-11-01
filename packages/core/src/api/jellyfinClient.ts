import axios from 'axios';
import { Jellyfin } from '@jellyfin/sdk';
import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api';
import type { RecommendedServerInfo } from '@jellyfin/sdk/lib/models/recommended-server-info';
import type { PublicSystemInfo } from '@jellyfin/sdk/lib/generated-client/models';
import { getDeviceId } from '../utils/deviceId';
import { getServerType, getUserId, type ServerType } from '../utils/localstorageCredentials';
import { rewriteForEmby, toEmbyDate } from './embyRoutes';

export type Platform = 'web' | 'tizen' | 'webos' | 'desktop';

export interface PlatformCapabilities {
    /** Direct-play containers this platforms player supports beyond the browser default mp4/webm. */
    extraDirectPlayContainers: string[];
    /** Direct-play/passthrough audio codecs this platform supports beyond aac/mp3/opus/flac. */
    extraDirectPlayAudioCodecs: string[];
}

const PLATFORM_CAPABILITIES: Record<Platform, PlatformCapabilities> = {
    web: {
        extraDirectPlayContainers: [],
        extraDirectPlayAudioCodecs: [],
    },
    tizen: {
        extraDirectPlayContainers: ['mkv'],
        extraDirectPlayAudioCodecs: ['ac3', 'eac3'],
    },
    webos: {
        extraDirectPlayContainers: [],
        extraDirectPlayAudioCodecs: [],
    },
    desktop: {
        extraDirectPlayContainers: [],
        extraDirectPlayAudioCodecs: [],
    },
};

function getDesktopOsName(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Macintosh')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    return 'Desktop';
}

function getBrowserName(): string {
    if (platform === 'tizen') return 'Samsung Smart TV';
    if (platform === 'webos') return 'LG webOS';
    if (platform === 'desktop') return getDesktopOsName();

    const ua = navigator.userAgent;
    if (ua.includes('Firefox/')) return 'Firefox';
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
    if (ua.includes('Chrome/')) return 'Chrome';
    if (ua.includes('Safari/')) return 'Safari';
    return 'Browser';
}

let clientName = 'Pelagica';
let clientVersion = '0.0.0';
let platform: Platform = 'web';
let jellyfinInstance: Jellyfin | null = null;

// Consuming apps must call this once at startup with their own package.json
// name/version, since the Jellyfin client identifies itself to the server.
export function setClientInfo(info: { name: string; version: string; platform?: Platform }) {
    clientName = info.name;
    clientVersion = info.version;
    platform = info.platform ?? 'web';
    jellyfinInstance = null;
}

export function getPlatform(): Platform {
    return platform;
}

export function getClientVersion(): string {
    return clientVersion;
}

export function getPlatformCapabilities(): PlatformCapabilities {
    return PLATFORM_CAPABILITIES[platform];
}

export function getJellyfinInstance(): Jellyfin {
    if (!jellyfinInstance) {
        jellyfinInstance = new Jellyfin({
            clientInfo: { name: clientName, version: clientVersion },
            deviceInfo: { name: getBrowserName(), id: getDeviceId() },
        });
    }
    return jellyfinInstance;
}

// Emby reads auth from X-Emby-Authorization and still uses the pre-10.9 user routes.
function createEmbyAxios(server: string) {
    const instance = axios.create();
    let basePath = '';
    try {
        basePath = new URL(server).pathname.replace(/\/+$/, '');
    } catch {
        // invalid server URL, the request itself will fail
    }

    instance.interceptors.request.use((config) => {
        const auth = config.headers.get('Authorization');
        if (auth) config.headers.set('X-Emby-Authorization', auth);

        const userId = getUserId();
        if (config.url && userId) {
            const url = new URL(config.url);
            const method = config.method ?? 'get';
            const path = url.pathname.slice(basePath.length);
            const user = url.searchParams.get('userId') ?? userId;
            const ids = url.searchParams.getAll('ids');

            if (
                method === 'get' &&
                path === '/Items' &&
                ids.length === 1 &&
                !ids[0].includes(',')
            ) {
                // Emby leaves music items out of user-scoped ?ids= lookups, so fetch the
                // item directly and wrap it back into the list shape the SDK expects
                url.pathname = `${basePath}/Users/${user}/Items/${ids[0]}`;
                url.searchParams.delete('ids');
                config.transformResponse = [
                    ...[config.transformResponse ?? []].flat(),
                    (data: unknown) => ({ Items: [data], TotalRecordCount: 1 }),
                ];
            } else {
                const rewritten = rewriteForEmby(method, path, user);
                if (rewritten) url.pathname = basePath + rewritten;
            }

            const datePlayed = url.searchParams.get('datePlayed');
            if (datePlayed) url.searchParams.set('datePlayed', toEmbyDate(datePlayed));

            config.url = url.toString();
        }
        return config;
    });
    return instance;
}

export function createApi(server: string, token?: string, serverType = getServerType()) {
    return getJellyfinInstance().createApi(
        server,
        token,
        serverType === 'emby' ? createEmbyAxios(server) : undefined
    );
}

export function isEmbyServer(): boolean {
    return getServerType() === 'emby';
}

export function serverTypeFromInfo(info: PublicSystemInfo): ServerType {
    const product = info.ProductName?.toLowerCase() ?? '';
    if (product.includes('jellyfin')) return 'jellyfin';
    if (product.includes('emby')) return 'emby';
    // Emby sends no ProductName. Jellyfin versions are 10.x, Emby versions are 4.x
    return Number(info.Version?.split('.')[0]) >= 10 ? 'jellyfin' : 'emby';
}

/** Asks the server's public info endpoint whether it is Jellyfin or Emby. */
export async function detectServerType(server: string): Promise<ServerType> {
    try {
        const { data } = await getSystemApi(
            createApi(server, undefined, 'jellyfin')
        ).getPublicSystemInfo();
        return serverTypeFromInfo(data);
    } catch {
        return 'jellyfin';
    }
}

/**
 * Like the SDK's `discovery.findBestServer`, but falls back to an Emby server,
 * which the SDK always scores as bad because its ProductName isn't "Jellyfin Server".
 */
export function findBestServer(
    servers: RecommendedServerInfo[]
): RecommendedServerInfo | undefined {
    return (
        getJellyfinInstance().discovery.findBestServer(servers) ??
        servers.find((s) => s.systemInfo?.Id && serverTypeFromInfo(s.systemInfo) === 'emby')
    );
}
