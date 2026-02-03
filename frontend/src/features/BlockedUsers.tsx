import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { getProfileFromCache, setProfileToCache } from '../services/profileCache';
import LoadingSpinner from '../components/LoadingSpinner';
import { generateGradient, getInitials, shortenPubkey } from '../utils/format';

interface BlockedUser {
    pubkey: string;
    name?: string;
    picture?: string;
    isLoading?: boolean;
}

const BlockedUsers: React.FC = () => {
    const [blockedList, setBlockedList] = useState<BlockedUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchBlockedUsers = async () => {
        setIsLoading(true);
        try {
            const pubkeys = await api.getMyMuted();
            const initialList = pubkeys.map(pk => {
                const cached = getProfileFromCache(pk);
                return {
                    pubkey: pk,
                    name: cached?.display_name || cached?.name,
                    picture: cached?.picture,
                    isLoading: !cached
                };
            });
            setBlockedList(initialList);
            setIsLoading(false); // Stop the main spinner early

            // Fetch profiles progressively
            for (const pk of pubkeys) {
                if (getProfileFromCache(pk)) continue;

                try {
                    const profile = await api.getProfile(pk);
                    if (profile) {
                        setProfileToCache(pk, profile);
                        setBlockedList(prev => prev.map(u =>
                            u.pubkey === pk
                                ? { ...u, name: profile.display_name || profile.name, picture: profile.picture, isLoading: false }
                                : u
                        ));
                    }
                } catch (e) {
                    console.error(`Failed to fetch profile for ${pk}`, e);
                    setBlockedList(prev => prev.map(u => u.pubkey === pk ? { ...u, isLoading: false } : u));
                }
            }
        } catch (error) {
            console.error('Failed to fetch blocked users:', error);
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBlockedUsers();
    }, []);

    const handleUnblock = async (pubkey: string) => {
        // Optimistic update
        setBlockedList(prev => prev.filter(u => u.pubkey !== pubkey));

        try {
            await api.unmuteUser(pubkey);
        } catch (error) {
            console.error('Failed to unblock:', error);
            // Revert on failure (could refetch, but simplified for now)
            fetchBlockedUsers();
        }
    };

    if (isLoading && blockedList.length === 0) {
        return (
            <div className="blocked-container">
                <LoadingSpinner label="Loading blocked users..." size="medium" />
            </div>
        );
    }

    if (blockedList.length === 0) {
        return (
            <div className="blocked-container empty">
                <div className="empty-state">
                    <span className="icon">🛡️</span>
                    <h3>No blocked users</h3>
                    <p>You haven't blocked anyone yet.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="blocked-container">
            <div className="blocked-list">
                {blockedList.map(user => (
                    <div key={user.pubkey} className="blocked-item">
                        <div
                            className="user-avatar"
                            style={{
                                background: user.picture ? 'transparent' : generateGradient(user.pubkey)
                            }}
                        >
                            {user.picture ? (
                                <img src={user.picture} alt={user.name} />
                            ) : (
                                <span>{getInitials(user.name || user.pubkey)}</span>
                            )}
                        </div>

                        <div className="user-info">
                            <div className="user-name">{user.name || shortenPubkey(user.pubkey)}</div>
                            <div className="user-handle">@{shortenPubkey(user.pubkey)}</div>
                        </div>

                        <button
                            className="unblock-btn"
                            onClick={() => handleUnblock(user.pubkey)}
                        >
                            Unblock
                        </button>
                    </div>
                ))}
            </div>

            <style>{`
                .blocked-container {
                    padding: 20px;
                    max-width: 800px; /* Increased from 600px */
                    width: 100%;
                    margin: 0 auto;
                }

                .blocked-container.empty {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 50vh;
                }

                .empty-state {
                    text-align: center;
                    color: var(--text-muted);
                }

                .empty-state .icon {
                    font-size: 48px;
                    display: block;
                    margin-bottom: 16px;
                }

                .empty-state h3 {
                    margin: 0 0 8px 0;
                    color: var(--text-primary);
                }

                .blocked-list {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .blocked-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    background: rgba(255, 255, 255, 0.03);
                    padding: 12px 16px;
                    border-radius: 12px;
                    border: 1px solid var(--border-color);
                }

                .user-avatar {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    color: white;
                    flex-shrink: 0;
                }

                .user-avatar img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .user-info {
                    flex: 1;
                    min-width: 0;
                }

                .user-name {
                    font-weight: 600;
                    color: var(--text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .user-handle {
                    font-size: 14px;
                    color: var(--text-muted);
                }

                .unblock-btn {
                    padding: 8px 16px;
                    border-radius: 20px;
                    border: 1px solid var(--border-color);
                    background: transparent;
                    color: var(--text-primary);
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .unblock-btn:hover {
                    background: rgba(255, 59, 48, 0.1);
                    color: #ff3b30;
                    border-color: #ff3b30;
                }
            `}</style>
        </div>
    );
};

export default BlockedUsers;
