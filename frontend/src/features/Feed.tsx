import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { NostrEvent } from '../services/api';
import { wsService } from '../services/websocket';
import PostCard from '../components/PostCard';
import CreatePost from '../components/CreatePost';
import { feedCache } from '../services/feedCache';

const Feed: React.FC = () => {
    const [events, setEvents] = useState<NostrEvent[]>(feedCache.getEvents());
    const [loading, setLoading] = useState(!feedCache.hasFetched());
    const [error, setError] = useState<string | null>(null);
    const [isLive, setIsLive] = useState(false);

    const fetchFeed = async (silent = false) => {
        if (!silent) {
            setLoading(true);
        }
        try {
            const feedEvents = await api.getFeed();
            feedCache.setEvents(feedEvents);
            setEvents(feedCache.getEvents());
            setError(null);
        } catch (err) {
            console.error('Failed to fetch feed:', err);
            setError('Failed to load feed. Make sure the backend is running.');
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    };

    const handlePostCreated = async () => {
        // Silently refresh the feed without showing loading state
        await fetchFeed(true);

        // Show a brief "New post!" indicator
        setIsLive(true);
        setTimeout(() => setIsLive(false), 2000);
    };

    useEffect(() => {
        // Sync with cache first (in case updates happened while unmounted)
        setEvents(feedCache.getEvents());

        // Only fetch if we haven't fetched before
        if (!feedCache.hasFetched()) {
            fetchFeed();
        }

        // Connect to WebSocket for real-time updates
        const cleanup = wsService.connect(
            'feed',
            (message) => {
                if (message.type === 'feed' && message.event) {
                    const newEvent = message.event;

                    // Only add if we haven't seen this event
                    if (!feedCache.hasEvent(newEvent.id)) {
                        feedCache.addEvent(newEvent);
                        setEvents(feedCache.getEvents());
                        setIsLive(true);

                        // Reset live indicator after 2 seconds
                        setTimeout(() => setIsLive(false), 2000);
                    }
                }
            },
            (error) => {
                console.error('WebSocket error:', error);
            }
        );

        return cleanup;
    }, []);

    return (
        <div className="feed-view">
            {isLive && (
                <div className="live-indicator">
                    <span className="pulse"></span>
                    New post!
                </div>
            )}

            <CreatePost onPostCreated={handlePostCreated} />

            {loading && events.length === 0 && (
                <div className="loading-state">
                    <span>Loading nodes...</span>
                </div>
            )}

            {error && (
                <div className="error-card glass">
                    <p>{error}</p>
                    <button onClick={() => fetchFeed()}>Retry</button>
                </div>
            )}

            {!loading && !error && events.length === 0 && (
                <div className="empty-state">
                    <p>No notes found in your feed.</p>
                </div>
            )}

            <div className="posts-list">
                {events.map((event) => (
                    <PostCard key={event.id} event={event} />
                ))}
            </div>

            <style>{`
        .feed-view {
          background: var(--bg-color);
        }

        .loading-state, .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-muted);
        }

        .error-card {
          padding: 30px 20px;
          text-align: center;
          margin: 20px;
          background: var(--bg-card);
          border-radius: 12px;
          border: 1px solid var(--border-color);
        }

        .error-card p {
          color: var(--text-primary);
          margin-bottom: 15px;
        }

        .error-card button {
          background: var(--accent-color);
          color: white;
          padding: 8px 20px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
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
