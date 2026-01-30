// Application-wide constants

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export const WEBSOCKET_CONFIG = {
    MAX_RECONNECT_ATTEMPTS: 5,
    RECONNECT_DELAY: 2000,
    KEEPALIVE_INTERVAL: 20000,
} as const;

export const UI_CONFIG = {
    LIVE_INDICATOR_DURATION: 2000,
    SIDEBAR_WIDTH: 230,
    SIDEBAR_COLLAPSED_WIDTH: 80,
} as const;
