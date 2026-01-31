import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { formatRelativeTime, getInitials, generateGradient } from '../utils/format';

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

const ChatView: React.FC<ChatViewProps> = ({ partnerPubkey, partnerName, onBack }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch message history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const history = await api.getDMHistory(partnerPubkey);
        setMessages(history);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch DM history:', err);
        setError('Failed to load messages');
        setMessages([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [partnerPubkey]);

  // WebSocket for real-time messages
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/dm?partner_pubkey=${partnerPubkey}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('DM WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'dm' && data.event) {
          const ev = data.event;

          // Filter messages for this specific partner
          if (ev.partner_pubkey === partnerPubkey || (ev.from_me && ev.tags?.some((t: any) => t[0] === 'p' && t[1] === partnerPubkey))) {
            const incomingMessage: Message = {
              id: ev.id,
              content: ev.content,
              created_at: ev.created_at,
              from_me: ev.from_me,
            };

            setMessages((prev) => {
              // Avoid duplicates (e.g. echo from relay that might arrive before REST response)
              if (prev.some(m => m.id === incomingMessage.id)) return prev;
              return [...prev, incomingMessage];
            });
          }
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('DM WebSocket disconnected');
    };

    return () => {
      ws.close();
    };
  }, [partnerPubkey]);

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

  return (
    <div className="chat-view">
      {/* Header */}
      <div className="chat-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="chat-partner-avatar" style={{ background: gradient }}>
          <span>{initials}</span>
        </div>
        <div className="chat-partner-info">
          <div className="chat-partner-name">{partnerName}</div>
          <div className="chat-partner-status">Active</div>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {loading ? (
          <div className="chat-loading">Loading messages...</div>
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
                <div className="message-avatar" style={{ background: gradient }}>
                  <span>{initials}</span>
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

      {/* Input */}
      <div className="chat-input-container">
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
      </div>
    </div>
  );
};

export default ChatView;
