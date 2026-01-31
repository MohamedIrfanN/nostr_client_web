const API_BASE_URL = 'http://localhost:8000'; // Adjust if backend port is different

export interface NostrEvent {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
}

export interface ApiResponse<T> {
    count?: number;
    events?: T;
    results?: T;
    profile?: T;
    following?: number;
    event_id?: string;
    inbox?: T;
    history?: T;
}

export const api = {
    async getFeed(): Promise<NostrEvent[]> {
        const response = await fetch(`${API_BASE_URL}/feed`);
        const data = await response.json();
        return data.events || [];
    },

    async publishNote(content: string): Promise<string> {
        const response = await fetch(`${API_BASE_URL}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
        });
        const data = await response.json();
        return data.event_id;
    },

    async searchUsers(q: string): Promise<{ profile?: any; results?: any[] }> {
        const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(q)}`);
        const data = await response.json();
        return data;
    },

    async getProfile(pubkey: string): Promise<any> {
        const response = await fetch(`${API_BASE_URL}/search?pubkey=${pubkey}`);
        const data = await response.json();
        return data.profile;
    },

    async followUser(pubkey: string): Promise<number> {
        const response = await fetch(`${API_BASE_URL}/follow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pubkey }),
        });
        const data = await response.json();
        return data.following;
    },

    async unfollowUser(pubkey: string): Promise<number> {
        const response = await fetch(`${API_BASE_URL}/unfollow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pubkey }),
        });
        const data = await response.json();
        return data.following;
    },

    async getDMInbox(): Promise<any[]> {
        const response = await fetch(`${API_BASE_URL}/dm/inbox`);
        if (!response.ok) {
            throw new Error(`Failed to fetch DM inbox: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();

        // Backend returns inbox as object keyed by pubkey, convert to array
        if (data.inbox && typeof data.inbox === 'object' && !Array.isArray(data.inbox)) {
            return Object.entries(data.inbox).map(([pubkey, chat]: [string, any]) => ({
                pubkey,
                display_name: chat.name,
                name: chat.name,
                last_event_at: chat.last_ts,
                last_message: chat.preview,
            }));
        }

        return data.inbox || [];
    },

    async getDMHistory(partnerPubkey: string): Promise<any[]> {
        const response = await fetch(`${API_BASE_URL}/dm/history?partner_pubkey=${partnerPubkey}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch DM history: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        const history = data.history || [];

        // Map backend fields (text, direction) to frontend fields (content, from_me)
        return history.map((msg: any, index: number) => ({
            id: msg.id || `${msg.created_at}-${index}`,
            content: msg.text || '',
            created_at: msg.created_at,
            from_me: msg.direction === 'OUT'
        }));
    },

    async sendDM(partnerPubkey: string, message: string): Promise<{ event_id: string }> {
        const response = await fetch(`${API_BASE_URL}/dm/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partner_pubkey: partnerPubkey, message }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Failed to send message: ${response.status}`);
        }

        return await response.json();
    },

    async reactToPost(eventId: string, reaction: string = '+'): Promise<{ event_id: string }> {
        const response = await fetch(`${API_BASE_URL}/react`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId, reaction }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Failed to react to post: ${response.status}`);
        }

        return await response.json();
    },

    async postComment(eventId: string, eventPubkey: string, content: string): Promise<{ event_id: string }> {
        const response = await fetch(`${API_BASE_URL}/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId, event_pubkey: eventPubkey, content }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Failed to post comment: ${response.status}`);
        }

        return await response.json();
    },

    async checkHealth(): Promise<boolean> {
        try {
            const response = await fetch(`${API_BASE_URL}/health`);
            const data = await response.json();
            return data.ok === true;
        } catch {
            return false;
        }
    }
};
