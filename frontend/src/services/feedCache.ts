import type { NostrEvent } from './api';

// Global feed cache to persist across component mounts/unmounts
let cachedFeedEvents: NostrEvent[] = [];
let hasFetchedFeed = false;
let feedEventIds = new Set<string>();

export const feedCache = {
    getEvents: () => [...cachedFeedEvents], // Return a new array to trigger React re-renders

    setEvents: (events: NostrEvent[]) => {
        cachedFeedEvents = events;
        feedEventIds = new Set(events.map(e => e.id));
        hasFetchedFeed = true;
    },

    addEvent: (event: NostrEvent) => {
        if (!feedEventIds.has(event.id)) {
            feedEventIds.add(event.id);
            cachedFeedEvents.push(event);
            // Always keep sorted by created_at descending (newest first)
            cachedFeedEvents.sort((a, b) => b.created_at - a.created_at);
        }
    },

    hasEvent: (eventId: string) => feedEventIds.has(eventId),

    hasFetched: () => hasFetchedFeed,

    clear: () => {
        cachedFeedEvents = [];
        hasFetchedFeed = false;
        feedEventIds.clear();
    }
};
