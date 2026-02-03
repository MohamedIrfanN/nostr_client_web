import { nip19 } from 'nostr-tools';

/**
 * Format timestamp as relative time
 */
export function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const eventTime = timestamp * 1000; // Convert to milliseconds
    const diffMs = now - eventTime;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffDay / 365);

    if (diffSec < 1) return 'now';
    if (diffSec < 60) return `${diffSec}s`;
    if (diffMin < 60) return `${diffMin}m`;
    if (diffHour < 24) return `${diffHour}h`;
    if (diffDay < 7) return `${diffDay}d`;
    if (diffWeek < 4) return `${diffWeek}w`;
    if (diffMonth < 12) return `${diffMonth}mo`;
    return `${diffYear}y`;
}

/**
 * Generate a gradient background based on pubkey
 */
export function generateGradient(pubkey: string | undefined): string {
    // Handle undefined or empty pubkey
    if (!pubkey) {
        return 'linear-gradient(135deg, hsl(200, 70%, 60%), hsl(220, 70%, 50%))';
    }

    // Use pubkey to generate consistent colors
    const hash = pubkey.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hue1 = hash % 360;
    const hue2 = (hash * 2) % 360;

    return `linear-gradient(135deg, hsl(${hue1}, 70%, 60%), hsl(${hue2}, 70%, 50%))`;
}

/**
 * Get initials from a name
 */
export function getInitials(name: string): string {
    if (!name) return '?';

    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

/**
 * Shorten pubkey for display
 * Deprecated: Use formatPubkey instead for npub format
 */
export function shortenPubkey(pubkey: string): string {
    if (pubkey.length < 16) return pubkey;
    return `${pubkey.substring(0, 8)}...${pubkey.substring(pubkey.length - 8)}`;
}

/**
 * Format pubkey to npub1... format
 */
export function formatPubkey(pubkey: string): string {
    try {
        const npub = nip19.npubEncode(pubkey);
        return `${npub.substring(0, 10)}...${npub.substring(npub.length - 8)}`;
    } catch (e) {
        console.error('Failed to encode pubkey:', e);
        return shortenPubkey(pubkey);
    }
}
