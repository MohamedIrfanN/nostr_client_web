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
        const data = await response.json();
        return data.inbox || [];
    },

    async getDMHistory(partnerPubkey: string): Promise<any[]> {
        const response = await fetch(`${API_BASE_URL}/dm/history?partner_pubkey=${partnerPubkey}`);
        const data = await response.json();
        return data.history || [];
    },

    async sendDM(partnerPubkey: string, message: string): Promise<string> {
        const response = await fetch(`${API_BASE_URL}/dm/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partner_pubkey: partnerPubkey, message }),
        });
        const data = await response.json();
        return data.event_id;
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
