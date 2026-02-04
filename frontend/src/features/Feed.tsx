import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { NostrEvent } from '../services/api';
import { wsService } from '../services/websocket';
import PostCard from '../components/PostCard';
import CreatePost from '../components/CreatePost';
import { feedCache } from '../services/feedCache';
import LoadingSpinner from '../components/LoadingSpinner';

import { api } from '../services/api';
import { followingService } from '../services/followingCache';

const Feed: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'following' | 'foryou'>('foryou');
    const [events, setEvents] = useState<NostrEvent[]>(feedCache.getEvents('foryou'));
    const [mutedSet, setMutedSet] = useState<Set<string>>(new Set());
    const [followingSet, setFollowingSet] = useState<Set<string>>(followingService.getFollowing());
    const [myPubkey, setMyPubkey] = useState<string>("");
    const [isLive, setIsLive] = useState(false);
    const [isFiltersLoaded, setIsFiltersLoaded] = useState(followingService.isLoaded());

    // Infinite Scroll State
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    // Track the oldest timestamp we have requested so far per tab
    const [oldestForyou, setOldestForyou] = useState<number | null>(null);
    const [oldestFollowing, setOldestFollowing] = useState<number | null>(null);

    // Track consecutive empty fetches
    const [emptyForyou, setEmptyForyou] = useState(0);
    const [emptyFollowing, setEmptyFollowing] = useState(0);

    const MAX_EMPTY_FETCHES = 10;

    const eventsEndRef = useRef<HTMLDivElement>(null);

    const handlePostCreated = async () => {
        setIsLive(true);
        setTimeout(() => setIsLive(false), 2000);
    };

    const loadMoreHistory = useCallback(() => {
        if (isLoadingMore) return;

        const consecutiveEmpty = activeTab === 'foryou' ? emptyForyou : emptyFollowing;
        if (consecutiveEmpty >= MAX_EMPTY_FETCHES) return;

        setIsLoadingMore(true);

        const cachedEvents = feedCache.getEvents(activeTab);
        let until: number;

        if (cachedEvents.length > 0) {
            until = cachedEvents[cachedEvents.length - 1].created_at;
        } else {
            const lastFetched = activeTab === 'foryou' ? oldestForyou : oldestFollowing;
            until = lastFetched !== null ? lastFetched : Math.floor(Date.now() / 1000) - 3600;
        }

        const since = until - (12 * 3600);
        const historyEndpoint = `feed?since=${since}&until=${until}&feed_type=${activeTab}`;

        let receivedEventCount = 0;
        const safetyTimeout = setTimeout(() => {
            setIsLoadingMore(false);
            if (activeTab === 'foryou') {
                setOldestForyou(since);
                setEmptyForyou(prev => prev + 1);
            } else {
                setOldestFollowing(since);
                setEmptyFollowing(prev => prev + 1);
            }
        }, 10000);

        const cleanupHistory = wsService.connect(
            historyEndpoint,
            (message) => {
                if (message.type === 'feed' && message.event) {
                    const ev = message.event;
                    if (!feedCache.hasEvent(activeTab, ev.id)) {
                        feedCache.addEvent(activeTab, ev);
                        setEvents(feedCache.getEvents(activeTab));
                        receivedEventCount++;
                    }
                }
                if (message.type === 'eose') {
                    cleanupHistory();
                    clearTimeout(safetyTimeout);
                    setIsLoadingMore(false);
                    if (activeTab === 'foryou') {
                        setOldestForyou(since);
                        setEmptyForyou(receivedEventCount === 0 ? prev => prev + 1 : 0);
                    } else {
                        setOldestFollowing(since);
                        setEmptyFollowing(receivedEventCount === 0 ? prev => prev + 1 : 0);
                    }
                }
            },
            () => {
                cleanupHistory();
                clearTimeout(safetyTimeout);
                setIsLoadingMore(false);
            }
        );
    }, [isLoadingMore, activeTab, oldestForyou, oldestFollowing, emptyForyou, emptyFollowing]);

    // Live Feed Connection
    useEffect(() => {
        if (!isFiltersLoaded) return;

        // Initialize state from cache for this tab
        setEvents(feedCache.getEvents(activeTab));

        // If cache empty, trigger backfill
        if (feedCache.getEvents(activeTab).length === 0) {
            loadMoreHistory();
        }

        const endpoint = `feed?feed_type=${activeTab}`;
        const cleanupLive = wsService.connect(
            endpoint,
            (message) => {
                if (message.type === 'feed' && message.event) {
                    const newEvent = message.event;
                    if (!feedCache.hasEvent(activeTab, newEvent.id)) {
                        feedCache.addEvent(activeTab, newEvent);
                        // Sync directly from cache to ensure UI matches source of truth
                        // This handles sorting and deduplication automatically via feedCache
                        setEvents(feedCache.getEvents(activeTab));

                        // Flash "New post" indicator if it's recent and on the Following tab
                        if (activeTab === 'following' && (Date.now() / 1000) - newEvent.created_at < 120) {
                            setIsLive(true);
                            setTimeout(() => setIsLive(false), 2000);
                        }
                    }
                }
            }
        );

        return () => cleanupLive();
    }, [activeTab, isFiltersLoaded]);

    // Initial Filter Load
    useEffect(() => {
        Promise.all([api.getMyMuted(), api.getMyFollowing(), api.getMe()])
            .then(([muted, following, me]) => {
                setMutedSet(new Set(muted));
                setFollowingSet(new Set(following));
                setMyPubkey(me.pubkey);
                setIsFiltersLoaded(true);
            });
    }, []);

    // Scroll Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) loadMoreHistory();
            },
            { threshold: 0.1, rootMargin: '100px' }
        );
        if (eventsEndRef.current) observer.observe(eventsEndRef.current);
        return () => observer.disconnect();
    }, [loadMoreHistory]);

    if (!isFiltersLoaded && events.length === 0) {
        return (
            <div className="feed-view">
                <div className="loading-state">
                    <LoadingSpinner label="Loading..." size="large" />
                </div>
            </div>
        );
    }

    return (
        <div className="feed-view">
            <div className="feed-tabs">
                <button
                    className={`feed-tab ${activeTab === 'foryou' ? 'active' : ''}`}
                    onClick={() => setActiveTab('foryou')}
                >
                    For you
                    {activeTab === 'foryou' && <div className="tab-indicator" />}
                </button>
                <button
                    className={`feed-tab ${activeTab === 'following' ? 'active' : ''}`}
                    onClick={() => setActiveTab('following')}
                >
                    Following
                    {activeTab === 'following' && <div className="tab-indicator" />}
                </button>
            </div>

            {isLive && (
                <div className="live-indicator">
                    <span className="pulse"></span>
                    New post!
                </div>
            )}

            <CreatePost onPostCreated={handlePostCreated} />

            {events.length === 0 && isLoadingMore && (
                <div className="loading-state">
                    <LoadingSpinner size="large" />
                </div>
            )}

            <div className="posts-list">
                {events
                    .filter(ev => {
                        const isMuted = mutedSet.has(ev.pubkey);
                        if (isMuted) return false;
                        if (activeTab === 'following') {
                            return followingSet.has(ev.pubkey) || ev.pubkey === myPubkey;
                        }
                        return true;
                    })
                    .map((event) => (
                        <PostCard key={event.id} event={event} />
                    ))}
            </div>

            <div ref={eventsEndRef} className="scroll-trigger" style={{ padding: '20px 0', minHeight: '60px' }} />

            <style>{`
        .feed-view {
          background: var(--bg-color);
          min-height: 100vh;
        }

        .feed-tabs {
            display: flex;
            border-bottom: 1px solid var(--border-color);
            position: sticky;
            top: 0;
            background: var(--bg-color);
            backdrop-filter: blur(10px);
            z-index: 90;
        }

        .feed-tab {
            flex: 1;
            padding: 16px;
            background: none;
            border: none;
            color: var(--text-muted);
            font-weight: 600;
            font-size: 15px;
            cursor: pointer;
            position: relative;
            transition: color 0.2s;
        }

        .feed-tab:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .feed-tab.active {
            color: var(--text-primary);
        }

        .tab-indicator {
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 56px;
            height: 4px;
            background: var(--accent-color);
            border-radius: 2px;
        }

        .loading-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-muted);
        }

        .scroll-trigger {
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .live-indicator {
          position: fixed;
          top: 80px;
          right: 30px;
          background: var(--accent-color);
          color: white;
          padding: 10px 20px;
          border-radius: 30px;
          font-size: 14px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: var(--shadow-md);
          z-index: 100;
        }

        .pulse {
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
      `}</style>
        </div>
    );
};

export default Feed;
