// In-memory cache for the following list
// This allows instant access to "who I follow" without waiting for API calls,
// preventing the feed delay on tab switch.

let followingCache: Set<string> = new Set();
let isLoaded = false;

export const followingService = {
    getFollowing: (): Set<string> => {
        return new Set(followingCache);
    },

    setFollowing: (pubkeys: string[]) => {
        followingCache = new Set(pubkeys);
        isLoaded = true;
    },

    addFollow: (pubkey: string) => {
        followingCache.add(pubkey);
    },

    removeFollow: (pubkey: string) => {
        followingCache.delete(pubkey);
    },

    isFollowing: (pubkey: string): boolean => {
        return followingCache.has(pubkey);
    },

    isLoaded: (): boolean => {
        return isLoaded;
    },

    clear: () => {
        followingCache.clear();
        isLoaded = false;
    }
};
