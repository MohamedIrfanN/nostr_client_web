import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import { dmCache } from '../services/dmCache';
import type { InboxChat as CacheChat } from '../services/dmCache';
import { getProfileWithCache } from '../services/profileCache';
import { generateGradient, getInitials, formatRelativeTime, formatPubkey } from '../utils/format';
import ChatView from './ChatView';
import LoadingSpinner from '../components/LoadingSpinner';

interface SelectedChat {
  pubkey: string;
  name: string;
}

interface InboxChat extends CacheChat {
  display_name?: string;
  name?: string;
  picture?: string;
}

const Messages: React.FC = () => {
  const [inbox, setInbox] = useState<InboxChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [mutedSet, setMutedSet] = useState<Set<string>>(new Set());

  // Debounce ref to prevent render storms
  const updateTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerInboxUpdate = () => {
    if (updateTimeoutRef.current) return;

    updateTimeoutRef.current = setTimeout(() => {
      updateInboxFromCache();
      updateTimeoutRef.current = null;
    }, 500); // 500ms debounce
  };

  const updateInboxFromCache = async () => {
    const chats = dmCache.getInbox();

    setInbox(prevInbox => {
      return chats.map(c => {
        const existing = prevInbox.find(p => p.pubkey === c.pubkey);
        return {
          ...c,
          display_name: existing?.display_name,
          name: existing?.name,
          picture: existing?.picture
        };
      });
    });

    // Optimization: Don't filter, just iterate. Profile cache handles validation.
    const missingProfiles = chats;

    await Promise.all(missingProfiles.map(async (chat) => {
      const profile = await getProfileWithCache(chat.pubkey, api.getProfile);
      if (profile) {
        setInbox(prev => prev.map(item => {
          if (item.pubkey === chat.pubkey) {
            return {
              ...item,
              display_name: profile.display_name,
              name: profile.name,
              picture: profile.picture
            };
          }
          return item;
        }));
      }
    }));
  };

  useEffect(() => {
    // Load muted list
    api.getMyMuted().then(list => setMutedSet(new Set(list))).catch(console.error);

    // 1. Load cache immediately
    if (dmCache.hasFetched()) {
      updateInboxFromCache().then(() => setLoading(false));
    }

    // 2. Fast/Recent Load (Last 30 Days)
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 3600);

    const cleanupFunctions: (() => void)[] = [];

    const cleanupRecent = wsService.connect(
      `dm?since=${thirtyDaysAgo}`,
      (message) => {
        if (message.type === 'dm' && message.event) {
          if (message.event.partner_pubkey) {
            dmCache.addEvent(message.event);
            triggerInboxUpdate();
            setError(null); // Clear any connection errors since we are getting data
            setLoading(false);
          }
        }
      },
      (err) => {
        console.error('Recent DM error:', err);
        // Only show error if we have absolutely nothing to show
        setTimeout(() => {
          if (!dmCache.hasFetched() && inbox.length === 0) setError('Connection failed');
        }, 3000);
      }
    );
    cleanupFunctions.push(cleanupRecent);

    // 3. Background History Load
    const twoYearsAgo = Math.floor(Date.now() / 1000) - (2 * 365 * 24 * 3600);

    const backfillTimer = setTimeout(() => {
      const cleanupHistory = wsService.connect(
        `dm?since=${twoYearsAgo}&limit=2000`,
        (message) => {
          if (message.type === 'dm' && message.event) {
            if (message.event.partner_pubkey) {
              dmCache.addEvent(message.event);
              triggerInboxUpdate();
            }
          }
        },
        (err) => console.log('History backfill error', err)
      );
      cleanupFunctions.push(cleanupHistory);
    }, 2000);

    const timeout = setTimeout(() => setLoading(false), 3000);

    return () => {
      cleanupFunctions.forEach(fn => fn());
      clearTimeout(backfillTimer);
      clearTimeout(timeout);
    };
  }, []);

  const handleImageError = (pubkey: string) => {
    setImageErrors((prev) => new Set(prev).add(pubkey));
  };

  if (selectedChat) {
    return (
      <ChatView
        partnerPubkey={selectedChat.pubkey}
        partnerName={selectedChat.name}
        onBack={() => setSelectedChat(null)}
      />
    );
  }

  return (
    <div className="messages-view">
      {loading && inbox.length === 0 ? (
        <LoadingSpinner label="Loading your conversations..." size="large" />
      ) : error && inbox.length === 0 ? (
        <div className="error-state card glass">
          <h3>⚠️ Error</h3>
          <p>{error}</p>
        </div>
      ) : inbox.length === 0 ? (
        <div className="empty-state card glass">
          <h3>No messages found</h3>
          <p>Your inbox is empty (or check your connection).</p>
        </div>
      ) : (
        <div className="inbox-list">
          {inbox.map((chat) => {
            const hasName = !!(chat.display_name || chat.name);
            const displayName = chat.display_name || chat.name || formatPubkey(chat.pubkey);
            const gradient = generateGradient(chat.pubkey);
            const initials = getInitials(displayName);
            const hasImage = chat.picture && !imageErrors.has(chat.pubkey);
            const isMuted = mutedSet.has(chat.pubkey);

            return (
              <div
                key={chat.pubkey}
                className={`inbox-chat-item ${!hasName ? 'loading-profile' : ''}`}
                onClick={() => setSelectedChat({ pubkey: chat.pubkey, name: displayName })}
                style={{ opacity: hasName ? 1 : 0.7, transition: 'opacity 0.3s' }}
              >
                <div className="inbox-avatar">
                  {hasImage ? (
                    <img
                      src={chat.picture}
                      alt={displayName}
                      onError={() => handleImageError(chat.pubkey)}
                    />
                  ) : (
                    <div className="inbox-avatar-gradient" style={{ background: gradient }}>
                      <span>{initials}</span>
                    </div>
                  )}
                </div>
                <div className="inbox-details">
                  <div className="inbox-header">
                    <span className="inbox-name" style={!hasName ? { fontFamily: 'monospace', fontSize: '0.9em' } : {}}>
                      {displayName}
                      {isMuted && <span style={{ color: '#ef4444', marginLeft: '6px', fontSize: '0.8em', border: '1px solid #ef4444', padding: '2px 4px', borderRadius: '4px' }}>🚫 Blocked</span>}
                    </span>
                    <span className="inbox-time">
                      {formatRelativeTime(chat.last_event_at)}
                    </span>
                  </div>
                  <div className="inbox-last-msg">{chat.last_message}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Messages;
