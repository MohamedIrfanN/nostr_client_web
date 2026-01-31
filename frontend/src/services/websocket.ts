import type { NostrEvent } from './api';

const WS_BASE_URL = 'ws://localhost:8000';

export type WebSocketMessageType = 'feed' | 'dm' | 'notify' | 'ping';

export interface WebSocketMessage {
    type: WebSocketMessageType;
    event?: NostrEvent;
}

export type WebSocketCallback = (message: WebSocketMessage) => void;

class WebSocketService {
    private connections: Map<string, WebSocket> = new Map();
    private reconnectTimeouts: Map<string, number> = new Map();
    private reconnectAttempts: Map<string, number> = new Map();
    private maxReconnectAttempts = 5;
    private reconnectDelay = 2000;

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

        ws.onopen = () => {
            console.log(`WebSocket connected: ${endpoint}`);
            this.reconnectAttempts.set(key, 0);
        };

        ws.onmessage = (event) => {
            try {
                const data: WebSocketMessage = JSON.parse(event.data);

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
            console.error(`WebSocket error on ${endpoint}:`, error);
            if (onError) {
                onError(error);
            }
        };

        ws.onclose = () => {
            console.log(`WebSocket closed: ${endpoint}`);
            this.connections.delete(key);

            // Attempt reconnection
            const attempts = this.reconnectAttempts.get(key) || 0;
            if (attempts < this.maxReconnectAttempts) {
                this.reconnectAttempts.set(key, attempts + 1);
                const timeout = setTimeout(() => {
                    console.log(`Reconnecting to ${endpoint} (attempt ${attempts + 1})...`);
                    this.connect(endpoint, onMessage, onError);
                }, this.reconnectDelay * (attempts + 1));
                this.reconnectTimeouts.set(key, timeout);
            }
        };

        this.connections.set(key, ws);

        // Return cleanup function
        return () => this.disconnect(key);
    }

    disconnect(key: string) {
        const ws = this.connections.get(key);
        if (ws) {
            ws.close();
            this.connections.delete(key);
        }

        const timeout = this.reconnectTimeouts.get(key);
        if (timeout) {
            clearTimeout(timeout);
            this.reconnectTimeouts.delete(key);
        }

        this.reconnectAttempts.delete(key);
    }

    disconnectAll() {
        this.connections.forEach((_, key) => this.disconnect(key));
    }
}

export const wsService = new WebSocketService();
