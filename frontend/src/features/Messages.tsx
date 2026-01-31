import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { getProfileWithCache } from '../services/profileCache';
import { generateGradient, getInitials, formatRelativeTime } from '../utils/format';
import ChatView from './ChatView';
import LoadingSpinner from '../components/LoadingSpinner';

interface SelectedChat {
  pubkey: string;
  name: string;
}

interface InboxChat {
  pubkey: string;
  display_name?: string;
  name?: string;
  last_event_at?: number;
  last_message?: string;
  picture?: string;
}

const Messages: React.FC = () => {
  const [inbox, setInbox] = useState<InboxChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchInbox = async () => {
      try {
        const data = await api.getDMInbox();
        setInbox(data);
        setError(null);

        // Prefetch profile pictures for all inbox items
        const pubkeys = data.map((chat: any) => chat.pubkey).filter(Boolean);
        await Promise.all(
          pubkeys.map(async (pubkey: string) => {
            const profile = await getProfileWithCache(pubkey, api.getProfile);
            if (profile?.picture) {
              // Update inbox item with profile picture
              setInbox((prev) =>
                prev.map((chat) =>
                  chat.pubkey === pubkey ? { ...chat, picture: profile.picture } : chat
                )
              );
            }
          })
        );
      } catch (err) {
        console.error('Failed to fetch DM inbox:', err);
        setError('Failed to load messages. Please try again later.');
        setInbox([]);
      } finally {
        setLoading(false);
      }
    };
    fetchInbox();
  }, []);

  const handleImageError = (pubkey: string) => {
    setImageErrors((prev) => new Set(prev).add(pubkey));
  };

  // If a chat is selected, show ChatView
  if (selectedChat) {
    return (
      <ChatView
        partnerPubkey={selectedChat.pubkey}
        partnerName={selectedChat.name}
        onBack={() => setSelectedChat(null)}
      />
    );
  }

  // Otherwise, show inbox list
  return (
    <div className="messages-view">
      {loading ? (
        <LoadingSpinner label="Loading your conversations..." size="large" />
      ) : error ? (
        <div className="error-state card glass">
          <h3>⚠️ Error</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      ) : !Array.isArray(inbox) || inbox.length === 0 ? (
        <div className="empty-state card glass">
          <h3>No messages yet</h3>
          <p>Start a conversation by searching for a user.</p>
        </div>
      ) : (
        <div className="inbox-list">
          {inbox.filter(chat => chat && chat.pubkey).map((chat) => {
            const displayName = chat.display_name || chat.name || 'Anonymous';
            const gradient = generateGradient(chat.pubkey);
            const initials = getInitials(displayName);
            const hasImage = chat.picture && !imageErrors.has(chat.pubkey);

            return (
              <div
                key={chat.pubkey}
                className="inbox-chat-item"
                onClick={() => setSelectedChat({ pubkey: chat.pubkey, name: displayName })}
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
                    <span className="inbox-name">{displayName}</span>
                    <span className="inbox-time">
                      {chat.last_event_at
                        ? formatRelativeTime(chat.last_event_at)
                        : 'Unknown'}
                    </span>
                  </div>
                  <div className="inbox-last-msg">{chat.last_message || 'No message'}</div>
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
