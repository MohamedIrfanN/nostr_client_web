import React, { useEffect, useState } from 'react';
import type { NostrEvent } from '../services/api';
import { api } from '../services/api';
import { formatRelativeTime, generateGradient, getInitials, shortenPubkey } from '../utils/format';
import { getProfileWithCache } from '../services/profileCache';

interface PostCardProps {
  event: NostrEvent;
}

interface ProfileData {
  display_name?: string;
  name?: string;
  picture?: string;
  about?: string;
}

const PostCard: React.FC<PostCardProps> = ({ event }) => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // Use cached profile fetching
        const profileData = await getProfileWithCache(event.pubkey, api.getProfile);
        if (profileData) {
          setProfile(profileData);
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      }
    };
    fetchProfile();
  }, [event.pubkey]);

  const displayName = profile?.display_name || profile?.name || shortenPubkey(event.pubkey);
  const avatarUrl = profile?.picture && !imageError ? profile.picture : null;
  const relativeTime = formatRelativeTime(event.created_at);
  const gradient = generateGradient(event.pubkey);
  const initials = getInitials(profile?.display_name || profile?.name || event.pubkey);

  return (
    <div className="post-card">
      <div className="post-header">
        <div className="post-avatar" style={{ background: avatarUrl ? 'transparent' : gradient }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              onError={() => setImageError(true)}
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <div className="post-meta">
          <span className="post-author" title={event.pubkey}>{displayName}</span>
          <span className="post-date">{relativeTime}</span>
          <button className="post-menu">⋯</button>
        </div>
      </div>

      <div className="post-content">
        {event.content}
      </div>

      <div className="post-actions">
        <button className="action-btn">
          <span className="action-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </span>
          <span className="action-count">0</span>
        </button>
        <button className="action-btn">
          <span className="action-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="17 1 21 5 17 9"></polyline>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
              <polyline points="7 23 3 19 7 15"></polyline>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            </svg>
          </span>
          <span className="action-count">0</span>
        </button>
        <button className="action-btn">
          <span className="action-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </span>
          <span className="action-count">0</span>
        </button>
        <button className="action-btn">
          <span className="action-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </span>
          <span className="action-count">0</span>
        </button>
        <button className="action-btn share-btn">
          <span className="action-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
          </span>
        </button>
      </div>

      <style>{`
        .post-card {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
          transition: background 0.2s;
        }

        .post-card:hover {
          background: rgba(255, 255, 255, 0.02);
        }

        .post-header {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
        }

        .post-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 16px;
          color: white;
          overflow: hidden;
          flex-shrink: 0;
        }

        .post-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .post-meta {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .post-author {
          font-weight: 600;
          font-size: 15px;
          color: var(--text-primary);
        }

        .post-date {
          font-size: 14px;
          color: var(--text-muted);
        }

        .post-menu {
          margin-left: auto;
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 18px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: var(--transition);
        }

        .post-menu:hover {
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-primary);
        }

        .post-content {
          font-size: 15px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--text-primary);
          margin-bottom: 12px;
          padding-left: 52px;
        }

        .post-actions {
          display: flex;
          gap: 4px;
          padding-left: 52px;
        }

        .action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 14px;
          cursor: pointer;
          border-radius: 6px;
          transition: var(--transition);
        }

        .action-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-primary);
        }

        .action-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .action-icon svg {
          display: block;
        }

        .action-count {
          font-size: 13px;
          font-weight: 500;
        }

        .share-btn {
          margin-left: auto;
        }
      `}</style>
    </div>
  );
};

export default PostCard;
