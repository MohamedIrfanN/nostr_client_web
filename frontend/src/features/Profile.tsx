import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { NostrEvent } from '../services/api';
import { getProfileWithCache, getCachedUserPosts, cacheUserPosts, getCurrentUser } from '../services/profileCache';
import { wsService } from '../services/websocket';
import type { WebSocketMessage } from '../services/websocket';
import PostCard from '../components/PostCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { generateGradient, getInitials, formatPubkey } from '../utils/format';
import { nip19 } from 'nostr-tools';

interface ProfileProps {
    pubkey: string;
    profile?: any;
}

const Profile: React.FC<ProfileProps> = ({ pubkey, profile: initialProfile }) => {
    const [posts, setPosts] = useState<NostrEvent[]>([]);
    // Split loading states
    const [isPostsLoading, setIsPostsLoading] = useState(true);
    const [isProfileLoading, setIsProfileLoading] = useState(!initialProfile);

    const [profile, setProfile] = useState(initialProfile);
    const [stats, setStats] = useState<{ following_count: number; followers_count: number } | null>(null);
    const [relationshipStatus, setRelationshipStatus] = useState<'loading' | 'ready'>('loading');
    const [isFollowing, setIsFollowing] = useState<boolean>(false);

    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'posts' | 'replies'>('posts');
    const [copied, setCopied] = useState(false);
    const [currentUserPubkey, setCurrentUserPubkey] = useState<string | null>(() => {
        return getCurrentUser()?.pubkey || null;
    });
    const [isHoveringFollow, setIsHoveringFollow] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);

    // Initial Profile Metadata Load
    useEffect(() => {
        let isMounted = true;

        // Reset state on profile change
        setRelationshipStatus('loading');

        const loadProfile = async () => {
            // Get current user pubkey to verify if it's "Me"
            if (!currentUserPubkey) {
                api.getMe().then(me => {
                    if (isMounted) setCurrentUserPubkey(me.pubkey);
                }).catch(console.error);
            }

            // If passed as prop, use it
            if (initialProfile) {
                setIsProfileLoading(false);
            } else {
                try {
                    setIsProfileLoading(true);
                    // Memory Cache + API Fetch
                    const p = await getProfileWithCache(pubkey, api.getProfile);
                    if (isMounted) {
                        setProfile(p);
                        setIsProfileLoading(false);
                    }
                } catch (err) {
                    console.error('Profile fetch error', err);
                    if (isMounted) setIsProfileLoading(false);
                }
            }
        };
        loadProfile();

        // Connect to Stats WebSocket for progressive loading
        const cleanupStats = wsService.connect(
            `stats/${pubkey}`,
            (message: WebSocketMessage) => {
                if (message.type === 'stats') {
                    setStats(prev => ({
                        following_count: message.following ?? prev?.following_count ?? 0,
                        followers_count: message.followers ?? prev?.followers_count ?? 0
                    }));
                }
            }
        );

        return () => {
            isMounted = false;
            cleanupStats();
        };
    }, [pubkey, initialProfile]);

    // WebSocket for Relationship Status
    useEffect(() => {
        // If viewing own profile, no need to check relationship
        if (currentUserPubkey === pubkey) {
            setRelationshipStatus('ready');
            return;
        }

        const cleanup = wsService.connect(
            `relationship?target_pubkey=${pubkey}`,
            (message: WebSocketMessage) => {
                if (message.type === 'relationship') {
                    if (typeof message.is_following === 'boolean') {
                        setIsFollowing(message.is_following);
                        setRelationshipStatus('ready');
                    }
                }
            }
        );

        return cleanup;
    }, [pubkey, currentUserPubkey]);

    const handleFollow = async () => {
        if (followLoading) return;
        setFollowLoading(true);
        // Optimistic update
        setIsFollowing(true);
        setStats(prev => prev ? { ...prev, followers_count: prev.followers_count + 1 } : null);

        try {
            await api.followUser(pubkey);
        } catch (err) {
            console.error('Follow failed', err);
            // Revert
            setIsFollowing(false);
            setStats(prev => prev ? { ...prev, followers_count: prev.followers_count - 1 } : null);
        } finally {
            setFollowLoading(false);
        }
    };

    const handleUnfollow = async () => {
        if (followLoading) return;
        setFollowLoading(true);
        // Optimistic update
        setIsFollowing(false);
        setStats(prev => prev ? { ...prev, followers_count: prev.followers_count - 1 } : null);

        try {
            await api.unfollowUser(pubkey);
        } catch (err) {
            console.error('Unfollow failed', err);
            // Revert
            setIsFollowing(true);
            setStats(prev => prev ? { ...prev, followers_count: prev.followers_count + 1 } : null);
        } finally {
            setFollowLoading(false);
        }
    };

    // WebSocket Stream for Posts
    useEffect(() => {
        // 1. Try Cache First
        const cached = getCachedUserPosts(pubkey);
        if (cached && cached.length > 0) {
            setPosts(cached);
            setIsPostsLoading(false);
        } else {
            setPosts([]);
            setIsPostsLoading(true);
        }

        setError(null);

        const cleanup = wsService.connect(
            `users/${pubkey}?limit=50`,
            (message: WebSocketMessage) => {
                if (message.type === 'feed' && message.event) {
                    const newEvent = message.event;
                    setPosts(prev => {
                        // Avoid duplicates
                        if (prev.some(p => p.id === newEvent.id)) return prev;

                        // Insert and Sort desc
                        const newPosts = [...prev, newEvent].sort((a, b) => b.created_at - a.created_at);

                        // Update cache
                        cacheUserPosts(pubkey, newPosts);

                        return newPosts;
                    });
                    setIsPostsLoading(false);
                }
                if (message.type === 'eose') {
                    // End of stored events - Ignore for UI to prevent flash
                    // Let timeout handle the empty state case
                }
            },
            (err) => {
                console.error('Profile stream error:', err);
                // Don't show error immediately
                setIsPostsLoading(false);
            }
        );

        // Safety timeout to disable spinner if no posts found
        const timeout = setTimeout(() => {
            setIsPostsLoading(false);
        }, 1500);

        return () => {
            cleanup();
            clearTimeout(timeout);
        };
    }, [pubkey]);

    const displayName = profile?.display_name || profile?.name || 'User';
    const handle = profile?.name || pubkey.substring(0, 8);
    const bio = profile?.about || 'No bio yet.';
    const website = profile?.website;
    const banner = profile?.banner;
    const avatar = profile?.picture;

    // Use specific loading state for header
    const isLoadingProfile = isProfileLoading && !profile;

    const isMe = currentUserPubkey === pubkey;

    // Render Follow Button Logic
    const renderActionButton = () => {
        if (isLoadingProfile || !currentUserPubkey) return null; // Skeleton or loading

        if (isMe) {
            return <button className="edit-profile-btn glass">Edit profile</button>;
        }

        if (relationshipStatus === 'loading') {
            return (
                <button className="edit-profile-btn glass" disabled>
                    Checking...
                </button>
            );
        }

        if (isFollowing) {
            return (
                <button
                    className={`edit-profile-btn glass following-btn ${isHoveringFollow ? 'unfollow-danger' : ''}`}
                    onClick={handleUnfollow}
                    onMouseEnter={() => setIsHoveringFollow(true)}
                    onMouseLeave={() => setIsHoveringFollow(false)}
                    disabled={followLoading}
                >
                    {isHoveringFollow ? 'Unfollow' : 'Following'}
                </button>
            );
        }

        return (
            <button
                className="edit-profile-btn glass follow-primary"
                onClick={handleFollow}
                disabled={followLoading}
            >
                Follow
            </button>
        );
    };

    return (
        <div className="profile-page">
            <div className="profile-header-container">
                <div className="profile-banner skeleton" style={{
                    background: isLoadingProfile ? undefined : (banner ? `url(${banner})` : generateGradient(pubkey)),
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                }}>
                    {!banner && !isLoadingProfile && <div className="banner-placeholder"></div>}
                </div>

                <div className="profile-main-info">
                    <div className="profile-avatar-row">
                        <div className={`profile-avatar-large ${isLoadingProfile ? 'skeleton skeleton-avatar' : ''}`} style={{
                            background: isLoadingProfile ? undefined : (avatar ? 'transparent' : generateGradient(pubkey))
                        }}>
                            {!isLoadingProfile && (avatar ? (
                                <img src={avatar} alt={displayName} />
                            ) : (
                                <span>{getInitials(displayName)}</span>
                            ))}
                        </div>
                        {renderActionButton()}
                    </div>

                    <div className="profile-metadata">
                        {isLoadingProfile ? (
                            <>
                                <div className="skeleton skeleton-text large"></div>
                                <div className="skeleton skeleton-text medium"></div>
                                <div className="skeleton skeleton-text small" style={{ marginTop: 12 }}></div>
                            </>
                        ) : (
                            <>
                                <h2 className="profile-display-name">{displayName}</h2>
                                <div className="profile-handle">
                                    @{formatPubkey(pubkey)}
                                    <button
                                        className="copy-btn-icon"
                                        onClick={() => {
                                            try {
                                                const npub = nip19.npubEncode(pubkey);
                                                navigator.clipboard.writeText(npub);
                                                setCopied(true);
                                                setTimeout(() => setCopied(false), 2000);
                                            } catch (err) {
                                                console.error('Failed to copy', err);
                                            }
                                        }}
                                        title="Copy public key"
                                    >
                                        {copied ? (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                        ) : (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                            </svg>
                                        )}
                                    </button>
                                </div>
                                <div className="profile-bio">{bio}</div>
                            </>
                        )}

                        <div className="profile-extra-info">
                            {website && !isLoadingProfile && (
                                <div className="info-item">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                                        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                                    </svg>
                                    <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noreferrer">
                                        {(() => {
                                            try {
                                                return new URL(website.startsWith('http') ? website : `https://${website}`).hostname;
                                            } catch {
                                                return website;
                                            }
                                        })()}
                                    </a>
                                </div>
                            )}

                        </div>

                        <div className="profile-stats">
                            <div className="stat">
                                <strong>{stats ? stats.following_count : '-'}</strong> <span>Following</span>
                            </div>
                            <div className="stat">
                                <strong>{stats ? stats.followers_count : '-'}</strong> <span>Followers</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="profile-tabs">
                    <div
                        className={`tab ${activeTab === 'posts' ? 'active' : ''}`}
                        onClick={() => setActiveTab('posts')}
                    >
                        Posts
                    </div>
                    <div
                        className={`tab ${activeTab === 'replies' ? 'active' : ''}`}
                        onClick={() => setActiveTab('replies')}
                    >
                        Replies
                    </div>
                </div>
            </div>

            <div className="profile-feed">
                {isPostsLoading ? (
                    <LoadingSpinner label="Loading posts..." size="large" />
                ) : error ? (
                    <div className="error-state">{error}</div>
                ) : posts.length === 0 ? (
                    <div className="empty-state">
                        <p>@{handle} hasn't posted anything yet.</p>
                    </div>
                ) : (
                    <div className="posts-list">
                        {posts
                            .filter(post => {
                                if (activeTab === 'posts') return true; // Show all
                                if (activeTab === 'replies') {
                                    // simple check for 'e' tag to determine if it's a reply
                                    return post.tags.some(t => t[0] === 'e');
                                }
                                return true;
                            })
                            // Posts are already sorted in state
                            .map(post => (
                                <PostCard key={post.id} event={post} />
                            ))}
                    </div>
                )}
            </div>

            <style>{`
        .profile-page {
            width: 100%;
            background: var(--bg-color);
            min-height: 100vh;
        }

        .profile-banner {
            height: 200px;
            width: 100%;
            position: relative;
        }

        .banner-placeholder {
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.05);
        }

        .profile-main-info {
            padding: 15px 15px 0;
            position: relative;
        }

        .profile-avatar-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: -65px;
            margin-bottom: 20px;
        }

        .profile-avatar-large {
            width: 130px;
            height: 130px;
            border-radius: 50%;
            border: 4px solid var(--bg-color);
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
            font-weight: 700;
            color: white;
            background: var(--bg-card);
        }

        .profile-avatar-large img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .edit-profile-btn {
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 700;
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            cursor: pointer;
            transition: all 0.2s;
            height: 40px;
            min-width: 120px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
        }

        .edit-profile-btn:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .follow-primary {
            background: white;
            color: black;
            border: none;
        }

        .follow-primary:hover {
            background: #e0e0e0;
        }

        .following-btn {
            /* Inherits glass style */
        }

        .unfollow-danger {
            border-color: #ef4444; /* red-500 */
            color: #ef4444;
            background: rgba(239, 68, 68, 0.1);
        }

        .profile-metadata {
            margin-bottom: 20px;
        }

        .profile-display-name {
            font-size: 20px;
            font-weight: 800;
            margin: 0;
        }

        .profile-handle {
            color: var(--text-muted);
            font-size: 15px;
            margin-bottom: 12px;
        }

        .profile-bio {
            font-size: 15px;
            line-height: 1.4;
            margin-bottom: 12px;
            color: var(--text-primary);
        }

        .profile-extra-info {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            color: var(--text-muted);
            font-size: 14px;
            margin-bottom: 12px;
        }

        .info-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .info-item a {
            color: var(--accent-color);
            text-decoration: none;
        }

        .profile-stats {
            display: flex;
            gap: 20px;
            font-size: 14px;
        }

        .stat strong {
            color: var(--text-primary);
            margin-right: 4px;
        }

        .stat span {
            color: var(--text-muted);
        }

        .profile-tabs {
            display: flex;
            border-bottom: 1px solid var(--border-color);
        }

        .tab {
            flex: 1;
            padding: 15px 0;
            text-align: center;
            font-weight: 600;
            color: var(--text-muted);
            cursor: pointer;
            transition: all 0.2s;
            position: relative;
        }

        .tab:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .tab.active {
            color: var(--text-primary);
        }

        .tab.active::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 50px;
            height: 4px;
            background: var(--accent-color);
            border-radius: 99px;
        }

        .profile-feed {
            padding-bottom: 60px;
        }

        .empty-state {
            padding: 40px;
            text-align: center;
            color: var(--text-muted);
        }
      `}</style>
        </div>
    );
};

export default Profile;
