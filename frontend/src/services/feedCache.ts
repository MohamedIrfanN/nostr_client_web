import type { NostrEvent } from './api';

export type FeedType = 'following' | 'foryou';

let caches: Record<FeedType, {
    events: NostrEvent[];
    ids: Set<string>;
    hasFetched: boolean;
}> = {
    following: { events: [], ids: new Set(), hasFetched: false },
    foryou: { events: [], ids: new Set(), hasFetched: false }
};

export const feedCache = {
    getEvents: (type: FeedType) => [...caches[type].events],

    setEvents: (type: FeedType, events: NostrEvent[]) => {
        caches[type].events = events;
        caches[type].ids = new Set(events.map(e => e.id));
        caches[type].hasFetched = true;
    },

    addEvent: (type: FeedType, event: NostrEvent) => {
        const cache = caches[type];
        if (!cache.ids.has(event.id)) {
            cache.ids.add(event.id);
            cache.events.push(event);
            cache.events.sort((a, b) => b.created_at - a.created_at);
        }
    },

    hasEvent: (type: FeedType, eventId: string) => caches[type].ids.has(eventId),

    hasFetched: (type: FeedType) => caches[type].hasFetched,

    clear: (type?: FeedType) => {
        if (type) {
            caches[type] = { events: [], ids: new Set(), hasFetched: false };
        } else {
            caches.following = { events: [], ids: new Set(), hasFetched: false };
            caches.foryou = { events: [], ids: new Set(), hasFetched: false };
        }
    }
};
