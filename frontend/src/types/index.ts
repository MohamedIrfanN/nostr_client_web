// Shared TypeScript types for the application

export interface NostrEvent {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
}

export interface ProfileData {
    display_name?: string;
    name?: string;
    picture?: string;
    about?: string;
    nip05?: string;
}

export interface DMInboxItem {
    pubkey: string;
    display_name?: string;
    name?: string;
    last_event_at: number;
    last_message: string;
}

export type Tab = 'home' | 'search' | 'messages' | 'profile';

export interface WebSocketMessage {
    type: string;
    event?: NostrEvent;
}
