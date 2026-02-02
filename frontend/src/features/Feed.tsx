import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { NostrEvent } from '../services/api';
import { wsService } from '../services/websocket';
import PostCard from '../components/PostCard';
import CreatePost from '../components/CreatePost';
import { feedCache } from '../services/feedCache';
import LoadingSpinner from '../components/LoadingSpinner';

const Feed: React.FC = () => {
    const [events, setEvents] = useState<NostrEvent[]>(feedCache.getEvents());
    const [isLive, setIsLive] = useState(false);

    // Infinite Scroll State
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    // Track the oldest timestamp we have requested so far. Start at "now - 1 hour" (since initial load is 1h)
    // Actually, we should derive this from the events list, but having a pointer helps for next fetch
    const [oldestFetchedTime, setOldestFetchedTime] = useState<number>(Math.floor(Date.now() / 1000) - 3600);

    const eventsEndRef = useRef<HTMLDivElement>(null);

    const handlePostCreated = async () => {
        setIsLive(true);
        setTimeout(() => setIsLive(false), 2000);
    };

    // Helper to load the next 12-hour block
    const loadMoreHistory = useCallback(() => {
        if (isLoadingMore) return;
        setIsLoadingMore(true);

        const until = oldestFetchedTime;
        const since = until - (12 * 3600); // 12 hours before that

        console.log(`Loading history: ${new Date(since * 1000).toLocaleString()} to ${new Date(until * 1000).toLocaleString()}`);

        const historyEndpoint = `feed?since=${since}&until=${until}`;

        // Safety timeout in case EOSE never comes
        const safetyTimeout = setTimeout(() => {
            console.log('History fetch safety timeout');
            cleanupHistory();
            setIsLoadingMore(false);
            setOldestFetchedTime(since); // Move pointer anyway
        }, 10000);

        const cleanupHistory = wsService.connect(
            historyEndpoint,
            (message) => {
                if (message.type === 'feed' && message.event) {
                    const ev = message.event;
                    if (!feedCache.hasEvent(ev.id)) {
                        feedCache.addEvent(ev);
                        setEvents(feedCache.getEvents());
                    }
                }
                if (message.type === 'eose') {
                    console.log('History block complete');
                    cleanupHistory();
                    clearTimeout(safetyTimeout);
                    setIsLoadingMore(false);
                    setOldestFetchedTime(since); // Successfully moved pointer
                }
            },
            (err) => {
                console.log('History stream error:', err);
                setIsLoadingMore(false);
            }
        );
    }, [isLoadingMore, oldestFetchedTime]);

    // Initial Load & Scroll Listener
    useEffect(() => {
        // Only fetch from cache initially, don't clear it to prevent blinking
        const cached = feedCache.getEvents();
        if (cached.length > 0) {
            setEvents(cached);
        }

        // 1. Live Feed (Last 1 Hour)
        const cleanupLive = wsService.connect(
            'feed',
            (message) => {
                if (message.type === 'feed' && message.event) {
                    const newEvent = message.event;
                    if (!feedCache.hasEvent(newEvent.id)) {
                        feedCache.addEvent(newEvent);
                        // Update state efficiently
                        setEvents(prev => {
                            // Re-sorting inside state update to prevent jitter
                            const newEvents = [...prev, newEvent].sort((a, b) => b.created_at - a.created_at);
                            return newEvents;
                        });
                        const isRecent = (Date.now() / 1000) - newEvent.created_at < 120;
                        if (isRecent) {
                            setIsLive(true);
                            setTimeout(() => setIsLive(false), 2000);
                        }
                    }
                }
            },
            (error) => {
                console.error('Live feed WS error:', error);
            }
        );

        // Trigger first backfill silently if we don't have enough posts
        setTimeout(() => {
            if (feedCache.getEvents().length < 5) {
                loadMoreHistory();
            }
        }, 1000);

        return () => {
            cleanupLive();
        };
    }, []); // Run once on mount

    // Scroll Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    loadMoreHistory();
                }
            },
            { threshold: 0.1, rootMargin: '100px' } // Trigger earlier (100px before bottom) for smoothness
        );

        if (eventsEndRef.current) {
            observer.observe(eventsEndRef.current);
        }

        return () => observer.disconnect();
    }, [loadMoreHistory]);

    return (
        <div className="feed-view">
            {isLive && (
                <div className="live-indicator">
                    <span className="pulse"></span>
                    New post!
                </div>
            )}

            <CreatePost onPostCreated={handlePostCreated} />

            {/* Main Loading State (Initial only) */}
            {events.length === 0 && (
                <div className="loading-state">
                    <LoadingSpinner label="Loading feed..." size="large" />
                </div>
            )}

            <div className="posts-list">
                {events.map((event) => (
                    <PostCard key={event.id} event={event} />
                ))}
            </div>

            {/* Invisible detector at bottom for infinite scroll - NO SPINNER */}
            <div ref={eventsEndRef} className="scroll-trigger" style={{ height: '10px', margin: '0' }} />

            <style>{`
        .feed-view {
          background: var(--bg-color);
          min-height: 100vh; /* Ensure full height to push footer down */
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
          animation: slideIn 0.3s ease;
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

        @keyframes slideIn {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
        </div>
    );
};

export default Feed;
