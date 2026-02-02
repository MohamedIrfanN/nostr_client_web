import type { NostrEvent } from './api';

export interface InboxChat {
    pubkey: string; // The partner's pubkey
    last_event_at: number;
    last_message: string;
    // We can cache profile info here too if we want, but stick to cache-keys for now
}

// Global cache: Map<PartnerPubkey, LatestEvent>
// We only really need to track the "latest" event for the inbox view.
// Full history is separate (per chat).
let inboxMap = new Map<string, NostrEvent>();
let hasFetchedInbox = false;

export const dmCache = {
    // Get list of conversations, sorted by latest message first
    getInbox: (): InboxChat[] => {
        const chats = Array.from(inboxMap.values()).map(ev => {
            const isMe = false; // We don't have 'my' pubkey easily here, but we rely on 'partner_pubkey' field we added in backend
            // In backend api.py: ev["partner_pubkey"] = partner
            const partner = ev.partner_pubkey;

            return {
                pubkey: partner,
                last_event_at: ev.created_at,
                last_message: ev.content,
            };
        });

        // Sort by time desc
        return chats.sort((a, b) => b.last_event_at - a.last_event_at);
    },

    addEvent: (event: NostrEvent) => {
        const partner = event.partner_pubkey;
        if (!partner) return;

        // Check if this event is newer than what we have
        const existing = inboxMap.get(partner);
        if (!existing || event.created_at > existing.created_at) {
            inboxMap.set(partner, event);
        }
        hasFetchedInbox = true;
    },

    hasFetched: () => hasFetchedInbox,

    clear: () => {
        inboxMap.clear();
        hasFetchedInbox = false;
    }
};
