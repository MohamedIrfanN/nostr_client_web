interface ProfileData {
    display_name?: string;
    name?: string;
    picture?: string;
    about?: string;
    nip05?: string;
}

// In-memory cache for profile data
const profileCache = new Map<string, ProfileData>();
const pendingRequests = new Map<string, Promise<ProfileData | null>>();

/**
 * Fetch profile data with caching to avoid duplicate requests
 */
export async function getProfileWithCache(
    pubkey: string,
    fetchFn: (pubkey: string) => Promise<ProfileData | null>
): Promise<ProfileData | null> {
    // Return from cache if available
    if (profileCache.has(pubkey)) {
        return profileCache.get(pubkey)!;
    }

    // If there's already a pending request for this pubkey, wait for it
    if (pendingRequests.has(pubkey)) {
        return pendingRequests.get(pubkey)!;
    }

    // Create new request
    const request = fetchFn(pubkey)
        .then((profile) => {
            if (profile) {
                profileCache.set(pubkey, profile);
            }
            pendingRequests.delete(pubkey);
            return profile;
        })
        .catch((error) => {
            console.error(`Failed to fetch profile for ${pubkey}:`, error);
            pendingRequests.delete(pubkey);
            return null;
        });

    pendingRequests.set(pubkey, request);
    return request;
}

/**
 * Clear the profile cache (useful for testing or manual refresh)
 */
export function clearProfileCache() {
    profileCache.clear();
    pendingRequests.clear();
}

/**
 * Prefetch multiple profiles at once
 */
export async function prefetchProfiles(
    pubkeys: string[],
    fetchFn: (pubkey: string) => Promise<ProfileData | null>
): Promise<void> {
    const uniquePubkeys = [...new Set(pubkeys)];
    const uncachedPubkeys = uniquePubkeys.filter(pk => !profileCache.has(pk) && !pendingRequests.has(pk));

    await Promise.all(
        uncachedPubkeys.map(pubkey => getProfileWithCache(pubkey, fetchFn))
    );
}
