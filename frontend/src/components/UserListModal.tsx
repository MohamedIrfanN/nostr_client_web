import React, { useEffect, useState, useRef } from 'react';
import { wsService } from '../services/websocket';
import { generateGradient, getInitials, shortenPubkey, formatPubkey } from '../utils/format';
import { api } from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import { getCachedContactList, setCachedContactList, type ProfileMetadata } from '../services/userListCache';
import { setProfileToCache } from '../services/profileCache';
import { followingService } from '../services/followingCache';
import { getCurrentUser } from '../services/profileCache';
import type { WebSocketMessage } from '../services/websocket';

interface UserListModalProps {
    pubkey: string;
    userName: string;
    type: 'followers' | 'following';
    expectedCount?: number;
    onClose: () => void;
}

const UserListModal: React.FC<UserListModalProps> = ({ pubkey, userName, type, expectedCount, onClose }) => {
    const [profiles, setProfiles] = useState<ProfileMetadata[]>(getCachedContactList(pubkey, type) || []);
    const [loading, setLoading] = useState(true);
    const [myFollowing, setMyFollowing] = useState<Set<string>>(followingService.getFollowing());
    const myPubkey = getCurrentUser()?.pubkey || '';

    const cleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        // Start streaming
        const endpoint = `users/${pubkey}/contacts?type=${type}`;
        const cleanup = wsService.connect(
            endpoint,
            (message: WebSocketMessage) => {
                if (message.type === 'profile' && message.profile) {
                    const prof = message.profile;

                    // Update global profile cache
                    setProfileToCache(prof.pubkey, prof);

                    // Update local list
                    setProfiles(prev => {
                        const index = prev.findIndex(p => p.pubkey === prof.pubkey);
                        let newList;
                        if (index !== -1) {
                            const existing = prev[index];
                            if (!existing._created_at || (prof._created_at && prof._created_at > existing._created_at)) {
                                newList = [...prev];
                                newList[index] = { ...existing, ...prof };
                            } else {
                                return prev;
                            }
                        } else {
                            newList = [...prev, prof];
                        }
                        // Update cache
                        setCachedContactList(pubkey, type, newList);
                        return newList;
                    });
                } else if (message.type === 'eose') {
                    setLoading(false);
                }
            }
        );

        cleanupRef.current = cleanup;
        return () => {
            if (cleanupRef.current) cleanupRef.current();
        };
    }, [pubkey, type, expectedCount]);

    useEffect(() => {
        if (expectedCount !== undefined && profiles.length >= expectedCount) {
            setLoading(false);
        }
    }, [profiles.length, expectedCount]);

    const handleFollow = async (targetPk: string) => {
        try {
            setMyFollowing(prev => new Set(prev).add(targetPk));
            await api.followUser(targetPk);
        } catch (err) {
            console.error('Follow failed', err);
            setMyFollowing(prev => {
                const next = new Set(prev);
                next.delete(targetPk);
                return next;
            });
        }
    };

    const handleUnfollow = async (targetPk: string) => {
        try {
            setMyFollowing(prev => {
                const next = new Set(prev);
                next.delete(targetPk);
                return next;
            });
            await api.unfollowUser(targetPk);
        } catch (err) {
            console.error('Unfollow failed', err);
            setMyFollowing(prev => new Set(prev).add(targetPk));
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-title-group">
                        <span className="modal-subtitle">Known {type} of</span>
                        <span className="modal-title">{userName}</span>
                    </div>
                    <button className="close-btn" onClick={onClose}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <div className="modal-body user-list-body">
                    {profiles.length === 0 && loading && (
                        <div className="modal-loading">
                            <LoadingSpinner label={`Fetching ${type}...`} size="medium" />
                        </div>
                    )}

                    {profiles.length === 0 && !loading && (
                        <div className="modal-empty-state">
                            No {type} found.
                        </div>
                    )}

                    <div className="user-list">
                        {profiles.map(profile => {
                            const pk = profile.pubkey;
                            const displayName = profile.display_name || profile.name || shortenPubkey(pk);
                            const handle = profile.name ? `@${profile.name}` : formatPubkey(pk);
                            const isFollowing = myFollowing.has(pk);
                            const isMe = pk === myPubkey;

                            return (
                                <div key={pk} className="user-list-item" onClick={() => {
                                    (window as any).navigateToProfile?.(pk, profile);
                                    onClose();
                                }}>
                                    <div
                                        className="user-avatar-small"
                                        style={{ background: profile.picture ? 'transparent' : generateGradient(pk) }}
                                    >
                                        {profile.picture ? (
                                            <img src={profile.picture} alt={displayName} />
                                        ) : (
                                            <span>{getInitials(displayName)}</span>
                                        )}
                                    </div>
                                    <div className="user-list-info">
                                        <div className="user-list-name">{displayName}</div>
                                        <div className="user-list-handle">{handle}</div>
                                    </div>
                                    {!isMe && (
                                        <button
                                            className={`modal-follow-btn ${isFollowing ? 'following' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                isFollowing ? handleUnfollow(pk) : handleFollow(pk);
                                            }}
                                        >
                                            {isFollowing ? 'Following' : 'Follow'}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {loading && profiles.length > 0 && (
                        <div className="modal-loading-more">
                            <LoadingSpinner size="small" />
                        </div>
                    )}
                </div>
            </div>

            <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .modal-content {
          width: 100%;
          max-width: 450px;
          max-height: 80vh;
          background: #121212;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        }

        .modal-header {
          padding: 20px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .modal-title-group {
          display: flex;
          flex-direction: column;
        }

        .modal-subtitle {
          font-size: 13px;
          color: var(--text-muted);
          margin-bottom: 2px;
        }

        .modal-title {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .close-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 8px;
          border-radius: 50%;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-primary);
        }

        .user-list-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px 0;
        }

        .user-list {
          display: flex;
          flex-direction: column;
        }

        .user-list-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 24px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .user-list-item:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .user-avatar-small {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-weight: 700;
          font-size: 14px;
          color: white;
        }

        .user-avatar-small img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .user-list-info {
          flex: 1;
          min-width: 0;
        }

        .user-list-name {
          font-weight: 700;
          font-size: 15px;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-list-handle {
          font-size: 13px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .modal-follow-btn {
          background: var(--accent-color, #7c4dff);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: opacity 0.2s, background 0.2s;
        }

        .modal-follow-btn:hover {
          opacity: 0.9;
        }

        .modal-follow-btn.following {
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-primary);
        }

        .modal-loading, .modal-empty-state {
          padding: 40px;
          text-align: center;
          color: var(--text-muted);
        }

        .modal-loading-more {
          padding: 12px;
          display: flex;
          justify-content: center;
        }
      `}</style>
        </div>
    );
};

export default UserListModal;
