import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import type { NostrEvent } from '../services/api';
import { wsService } from '../services/websocket';
import type { WebSocketMessage } from '../services/websocket';
import PostCard from '../components/PostCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { generateGradient, getInitials } from '../utils/format';

interface ProfileProps {
    pubkey: string;
    profile?: any;
}

const Profile: React.FC<ProfileProps> = ({ pubkey, profile: initialProfile }) => {
    const [posts, setPosts] = useState<NostrEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(initialProfile);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'posts' | 'replies'>('posts');

    const fetchUserContent = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch posts
            const userPosts = await api.getUserPosts(pubkey);
            setPosts(userPosts);

            // If we don't have profile yet, fetch it
            if (!profile) {
                const p = await api.getProfile(pubkey);
                setProfile(p);
            }
            setError(null);
        } catch (err) {
            console.error('Failed to fetch profile content:', err);
            setError('Could not load profile posts.');
        } finally {
            setLoading(false);
        }
    }, [pubkey, profile]);

    useEffect(() => {
        fetchUserContent();
    }, [fetchUserContent]);

    // Live streaming subscription
    useEffect(() => {
        const cleanup = wsService.connect(
            `users/${pubkey}`,
            (message: WebSocketMessage) => {
                if (message.type === 'feed' && message.event) {
                    const newEvent = message.event;
                    setPosts(prev => {
                        // Avoid duplicates
                        if (prev.some(p => p.id === newEvent.id)) return prev;
                        // Add new post to top
                        return [newEvent, ...prev];
                    });
                }
            },
            (err) => console.error('Profile stream error:', err)
        );
        return cleanup;
    }, [pubkey]);

    const displayName = profile?.display_name || profile?.name || 'User';
    const handle = profile?.name || pubkey.substring(0, 8);
    const bio = profile?.about || 'No bio yet.';
    const website = profile?.website;
    const banner = profile?.banner;
    const avatar = profile?.picture;

    const isLoadingProfile = loading && !profile;

    return (
        <div className="profile-page">
            <div className="profile-header-container">
                <div className="profile-banner skeleton" style={{
                    background: isLoadingProfile ? undefined : (banner ? `url(${banner})` : 'var(--bg-card)'),
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
                        <button className="edit-profile-btn glass">Edit profile</button>
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
                                <div className="profile-handle">@{handle}</div>
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
                            <div className="info-item">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                <span>Joined recently</span>
                            </div>
                        </div>

                        <div className="profile-stats">
                            <div className="stat"><strong>0</strong> <span>Following</span></div>
                            <div className="stat"><strong>0</strong> <span>Followers</span></div>
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
                {loading ? (
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
        }

        .edit-profile-btn:hover {
            background: rgba(255, 255, 255, 0.1);
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
