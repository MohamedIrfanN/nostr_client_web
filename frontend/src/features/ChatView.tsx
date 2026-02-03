import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import { formatRelativeTime, getInitials, generateGradient } from '../utils/format';
import { getProfileWithCache } from '../services/profileCache';
import LoadingSpinner from '../components/LoadingSpinner';

interface ChatViewProps {
  partnerPubkey: string;
  partnerName: string;
  onBack: () => void;
}

interface Message {
  id: string;
  content: string;
  created_at: number;
  from_me: boolean;
}

interface ProfileData {
  display_name?: string;
  name?: string;
  picture?: string;
}

const ChatView: React.FC<ChatViewProps> = ({ partnerPubkey, partnerName, onBack }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [imageError, setImageError] = useState(false);
  const [mutedSet, setMutedSet] = useState<Set<string>>(new Set());
  const [muteProcessing, setMuteProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Lock body scroll and reset position on mount
  useEffect(() => {
    window.scrollTo(0, 0);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Fetch mute list
  useEffect(() => {
    api.getMyMuted().then(list => setMutedSet(new Set(list))).catch(console.error);
  }, []);

  const isMuted = mutedSet.has(partnerPubkey);

  const handleUnblock = async () => {
    setMuteProcessing(true);
    try {
      await api.unmuteUser(partnerPubkey);
      setMutedSet(prev => {
        const next = new Set(prev);
        next.delete(partnerPubkey);
        return next;
      });
    } catch (err) {
      console.error("Failed to unblock:", err);
      alert("Failed to unblock user.");
    } finally {
      setMuteProcessing(false);
    }
  };

  // Fetch profile picture
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profileData = await getProfileWithCache(partnerPubkey, api.getProfile);
        if (profileData) {
          setProfile(profileData);
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      }
    };
    fetchProfile();
  }, [partnerPubkey]);

  // WebSocket Streaming for Messages
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setError(null);

    // If muted, we still might want to see history, but typically blocking means "I don't want to see them".
    // But per request: "going into their chatting screen its okay to display the chats".
    // However, "we shouldnt receive their messages" applies to NEW messages.

    const cleanup = wsService.connect(
      `dm?partner_pubkey=${partnerPubkey}&limit=50`,
      (message) => {
        if (message.type === 'dm' && message.event) {
          const ev = message.event;

          // Verify it belongs to this chat
          if (ev.partner_pubkey === partnerPubkey) {
            // Filter NEW incoming messages if blocked
            // Note: This relies on the current state of 'mutedSet' which might be stale in a closure
            // But since we mount/unmount chat, it should be fine.
            // Better: we can check the mute list if it was a ref, but `isMuted` here is captured.
            // Actually, since we want to allow HISTORY but block NEW, it's tricky to distinguish solely on client.
            // But usually "receive" implies live updates.

            // Simplest approach: We allow loading history (which comes instantly),
            // but if it's a "live" event (how do we know? WS sends both), we might block it.
            // Actually, 'dms' endpoint returns history.

            // The user request: "shouldnt receive their messages".
            // We can check if `from_me` is false and we are currently muted.

            // To properly use the *latest* mutedSet in this callback, we need a ref or access it via setState logic.
            // Since `mutedSet` is a dependency, this effect restarts if mutedSet changes. That's fine.

            if (mutedSet.has(partnerPubkey) && !ev.from_me) {
              // Skip incoming messages from blocked user
              return;
            }

            const incomingMessage: Message = {
              id: ev.id,
              content: ev.content,
              created_at: ev.created_at,
              from_me: ev.from_me || false,
            };

            setMessages(prev => {
              if (prev.some(m => m.id === incomingMessage.id)) return prev;
              return [...prev, incomingMessage].sort((a, b) => a.created_at - b.created_at);
            });
            setLoading(false);
          }
        }
        if (message.type === 'eose') {
          setLoading(false);
        }
      },
      (err) => {
        console.error('Chat stream error:', err);
        setLoading(false);
      }
    );

    const timeout = setTimeout(() => setLoading(false), 2000);

    return () => {
      cleanup();
      clearTimeout(timeout);
    };
  }, [partnerPubkey, mutedSet]); // Restart stream if mute status changes (to apply filter)

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;

    const messageText = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      const result = await api.sendDM(partnerPubkey, messageText);

      // Add message to UI only if it hasn't arrived via WebSocket already
      const eventId = result.event_id || Date.now().toString();

      setMessages((prev) => {
        // If the message already arrived via WebSocket (echo from relay), skip adding it
        if (prev.some(m => m.id === eventId)) return prev;

        const optimisticMessage: Message = {
          id: eventId,
          content: messageText,
          created_at: Math.floor(Date.now() / 1000),
          from_me: true,
        };
        return [...prev, optimisticMessage];
      });
    } catch (err) {
      console.error('Failed to send message:', err);
      setNewMessage(messageText); // Restore message on error
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const gradient = generateGradient(partnerPubkey);
  const initials = getInitials(partnerName);
  const avatarUrl = profile?.picture && !imageError ? profile.picture : null;

  return (
    <div className="chat-view">
      {/* Fixed Header */}
      <div className="chat-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="chat-partner-avatar" style={{ background: avatarUrl ? 'transparent' : gradient }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={partnerName}
              onError={() => setImageError(true)}
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <div className="chat-partner-info">
          <div className="chat-partner-name">{partnerName}</div>
        </div>
      </div>

      {/* Scrollable Messages */}
      <div className="chat-messages">
        {loading ? (
          <LoadingSpinner label="Loading conversation history..." size="large" />
        ) : error ? (
          <div className="chat-error">{error}</div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <p>No messages yet</p>
            <p className="chat-empty-hint">Send a message to start the conversation</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.from_me ? 'sent' : 'received'}`}>
              {!msg.from_me && (
                <div className="message-avatar" style={{ background: avatarUrl ? 'transparent' : gradient }}>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={partnerName}
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
              )}
              <div className="message-bubble">
                <div className="message-content">{msg.content}</div>
                <div className="message-time">{formatRelativeTime(msg.created_at)}</div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Fixed Input or Block Banner */}
      <div className="chat-input-container">
        {isMuted ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '10px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '12px',
            color: '#ef4444'
          }}>
            <span style={{ fontWeight: 500 }}>🚫 You have blocked this user</span>
            <button
              onClick={handleUnblock}
              disabled={muteProcessing}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              {muteProcessing ? 'Unblocking...' : 'Unblock'}
            </button>
          </div>
        ) : (
          <>
            <textarea
              className="chat-input"
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={sending}
              rows={1}
            />
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ChatView;
