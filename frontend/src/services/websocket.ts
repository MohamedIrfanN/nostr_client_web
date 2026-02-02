import type { NostrEvent } from './api';

const WS_BASE_URL = 'ws://localhost:8000';

export type WebSocketMessageType = 'feed' | 'dm' | 'notify' | 'ping' | 'eose' | 'relationship' | 'stats';

export interface WebSocketMessage {
    type: WebSocketMessageType;
    event?: NostrEvent;
    is_following?: boolean;
    target_pubkey?: string;
    following?: number;
    followers?: number;
}

export type WebSocketCallback = (message: WebSocketMessage) => void;

class WebSocketService {
    private connections: Map<string, WebSocket> = new Map();
    private reconnectTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private reconnectAttempts: Map<string, number> = new Map();
    private heartbeats: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private maxReconnectAttempts = 5;
    private reconnectDelay = 2000;
    private heartbeatInterval = 45000; // 45s timeout (backend pings every 20s)

    connect(
        endpoint: string,
        onMessage: WebSocketCallback,
        onError?: (error: Event) => void
    ): () => void {
        const url = `${WS_BASE_URL}/ws/${endpoint}`;
        const key = endpoint;

        // Close existing connection if any
        this.disconnect(key);

        const ws = new WebSocket(url);

        const startHeartbeat = () => {
            if (this.heartbeats.has(key)) clearTimeout(this.heartbeats.get(key)!);

            const timer = setTimeout(() => {
                console.warn(`Heartbeat timeout for ${endpoint}, reconnecting...`);
                // Force close, which triggers onclose -> reconnect (unless we disconnected manually)
                ws.close();
            }, this.heartbeatInterval);

            this.heartbeats.set(key, timer);
        };

        ws.onopen = () => {
            console.log(`WebSocket connected: ${endpoint}`);
            this.reconnectAttempts.set(key, 0);
            startHeartbeat();
        };

        ws.onmessage = (event) => {
            try {
                const data: WebSocketMessage = JSON.parse(event.data);

                // Reset heartbeat on any message (including ping)
                startHeartbeat();

                // Ignore ping messages
                if (data.type === 'ping') {
                    return;
                }

                onMessage(data);
            } catch (err) {
                console.error('Failed to parse WebSocket message:', err);
            }
        };

        ws.onerror = (error) => {
            console.error(`WebSocket error on ${endpoint}`, error);
            if (onError) {
                onError(error);
            }
        };

        ws.onclose = () => {
            console.log(`WebSocket closed: ${endpoint}`);
            this.connections.delete(key);
            if (this.heartbeats.has(key)) {
                clearTimeout(this.heartbeats.get(key)!);
                this.heartbeats.delete(key);
            }

            // Attempt reconnection
            const attempts = this.reconnectAttempts.get(key) || 0;
            if (attempts < this.maxReconnectAttempts) {
                this.reconnectAttempts.set(key, attempts + 1);
                const timeout = setTimeout(() => {
                    console.log(`Reconnecting to ${endpoint} (attempt ${attempts + 1})...`);
                    this.connect(endpoint, onMessage, onError);
                }, this.reconnectDelay * (attempts + 1));
                this.reconnectTimeouts.set(key, timeout);
            } else {
                console.error(`Max reconnect attempts reached for ${endpoint}`);
            }
        };

        this.connections.set(key, ws);

        // Return cleanup function
        return () => this.disconnect(key);
    }

    disconnect(key: string) {
        const ws = this.connections.get(key);
        if (ws) {
            // Important: Disable onclose handler to prevent auto-reconnect logic
            ws.onclose = null;
            ws.close();
            this.connections.delete(key);
        }

        const timeout = this.reconnectTimeouts.get(key);
        if (timeout) {
            clearTimeout(timeout);
            this.reconnectTimeouts.delete(key);
        }

        const hb = this.heartbeats.get(key);
        if (hb) {
            clearTimeout(hb);
            this.heartbeats.delete(key);
        }

        this.reconnectAttempts.delete(key);
    }

    disconnectAll() {
        this.connections.forEach((_, key) => this.disconnect(key));
    }
}

export const wsService = new WebSocketService();
