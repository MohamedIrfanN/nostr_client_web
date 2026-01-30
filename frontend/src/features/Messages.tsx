import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

const Messages: React.FC = () => {
    const [inbox, setInbox] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInbox = async () => {
            try {
                const data = await api.getDMInbox();
                setInbox(data);
            } catch (err) {
                console.error('Failed to fetch DM inbox:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchInbox();
    }, []);

    return (
        <div className="messages-view">
            {loading ? (
                <div className="loading">Loading messages...</div>
            ) : inbox.length === 0 ? (
                <div className="empty-state card glass">
                    <h3>No messages yet</h3>
                    <p>Start a conversation by searching for a user.</p>
                </div>
            ) : (
                <div className="inbox-list">
                    {inbox.map((chat) => (
                        <div key={chat.pubkey} className="chat-item card glass">
                            <div className="chat-avatar">
                                {chat.display_name?.[0] || chat.name?.[0] || '?'}
                            </div>
                            <div className="chat-details">
                                <div className="chat-header">
                                    <span className="chat-name">{chat.display_name || chat.name || 'Anonymous'}</span>
                                    <span className="chat-time">{new Date(chat.last_event_at * 1000).toLocaleDateString()}</span>
                                </div>
                                <div className="chat-last-msg">{chat.last_message}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <style>{`
        .chat-item {
          display: flex;
          padding: 16px;
          gap: 12px;
          cursor: pointer;
          margin-bottom: 10px;
          transition: var(--transition);
        }

        .chat-item:hover {
          background: var(--bg-card-hover);
        }

        .chat-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: var(--accent-color);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          flex-shrink: 0;
        }

        .chat-details {
          flex: 1;
          overflow: hidden;
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
        }

        .chat-name {
          font-weight: 600;
        }

        .chat-time {
          font-size: 12px;
          color: var(--text-muted);
        }

        .chat-last-msg {
          font-size: 14px;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .empty-state {
          padding: 60px 40px;
          text-align: center;
        }
      `}</style>
        </div>
    );
};

export default Messages;
