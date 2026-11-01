import { getApi } from '../api/getApi';
import { useQuery } from '@tanstack/react-query';
import { getMediaSegmentApi } from '@jellyfin/sdk/lib/utils/api/media-segment-api';
import type { MediaSegmentDto } from '@jellyfin/sdk/lib/generated-client/models';
import { getRetryConfig } from '../utils/authErrorHandler';
import { isEmbyServer } from '../api/jellyfinClient';

export function useMediaSegments(itemId: string | null | undefined) {
    return useQuery<MediaSegmentDto[]>({
        queryKey: ['mediaSegments', itemId],
        queryFn: async (): Promise<MediaSegmentDto[]> => {
            const api = getApi();
            const mediaSegmentsApi = getMediaSegmentApi(api);
            const response = await mediaSegmentsApi.getItemSegments({
                itemId: itemId!,
            });
            return response.data.Items || [];
        },
        enabled: !!itemId && !isEmbyServer(), // media segments are Jellyfin-only
        ...getRetryConfig(),
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
}
