export interface ProfileMetadata {
    pubkey: string;
    name?: string;
    display_name?: string;
    picture?: string;
    about?: string;
    nip05?: string;
    banner?: string;
    website?: string;
    _created_at?: number;
}

// Map of pubkey -> { followers: ProfileMetadata[], following: ProfileMetadata[] }
const contactListsCache = new Map<string, {
    followers?: ProfileMetadata[];
    following?: ProfileMetadata[];
    followersLastUpdate?: number;
    followingLastUpdate?: number;
}>();

export const getCachedContactList = (pubkey: string, type: 'followers' | 'following') => {
    const entry = contactListsCache.get(pubkey);
    if (!entry) return null;
    return type === 'followers' ? entry.followers : entry.following;
};

export const setCachedContactList = (pubkey: string, type: 'followers' | 'following', list: ProfileMetadata[]) => {
    const entry = contactListsCache.get(pubkey) || {};
    if (type === 'followers') {
        entry.followers = list;
        entry.followersLastUpdate = Date.now();
    } else {
        entry.following = list;
        entry.followingLastUpdate = Date.now();
    }
    contactListsCache.set(pubkey, entry);
};

export const updateCachedContactItem = (pubkey: string, type: 'followers' | 'following', profile: ProfileMetadata) => {
    const entry = contactListsCache.get(pubkey);
    if (!entry) return;

    const list = type === 'followers' ? entry.followers : entry.following;
    if (!list) return;

    const index = list.findIndex(p => p.pubkey === profile.pubkey);
    if (index !== -1) {
        // Only update if newer
        const existing = list[index];
        if (!existing._created_at || (profile._created_at && profile._created_at > existing._created_at)) {
            list[index] = { ...existing, ...profile };
        }
    } else {
        list.push(profile);
    }

    if (type === 'followers') {
        entry.followers = [...list];
    } else {
        entry.following = [...list];
    }
    contactListsCache.set(pubkey, entry);
};
