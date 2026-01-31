import React, { useEffect, useState } from 'react';
import type { NostrEvent } from '../services/api';
import { api } from '../services/api';
import { formatRelativeTime, generateGradient, getInitials, shortenPubkey } from '../utils/format';
import { getProfileWithCache } from '../services/profileCache';
import CommentModal from './CommentModal';

interface PostCardProps {
  event: NostrEvent;
}

interface ProfileData {
  display_name?: string;
  name?: string;
  picture?: string;
  about?: string;
}

// LocalStorage key for liked posts
const LIKED_POSTS_KEY = 'nostr_liked_posts';

// Helper functions for managing liked posts in localStorage
const getLikedPosts = (): Set<string> => {
  try {
    const stored = localStorage.getItem(LIKED_POSTS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const saveLikedPosts = (likedPosts: Set<string>) => {
  try {
    localStorage.setItem(LIKED_POSTS_KEY, JSON.stringify(Array.from(likedPosts)));
  } catch (err) {
    console.error('Failed to save liked posts:', err);
  }
};

const PostCard: React.FC<PostCardProps> = ({ event }) => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [imageError, setImageError] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [replyToPubkey, setReplyToPubkey] = useState<string | null>(null);
  const [replyToProfile, setReplyToProfile] = useState<ProfileData | null>(null);

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

    // Check if it's a reply and extract the pubkey to show "Replying to"
    const pTags = event.tags.filter(t => t[0] === 'p');
    if (pTags.length > 0) {
      // Prefer the 'reply' marker if standard NIP-10 tags are present, 
      // otherwise take the first one (usually the one being replied to)
      const replyTag = pTags.find(t => t[3] === 'reply') || pTags[0];
      const targetPubkey = replyTag[1];
      setReplyToPubkey(targetPubkey);

      // Fetch the profile for the person being replied to
      const fetchReplyProfile = async () => {
        try {
          const profileData = await getProfileWithCache(targetPubkey, api.getProfile);
          if (profileData) setReplyToProfile(profileData);
        } catch (err) {
          console.error('Failed to fetch reply profile:', err);
        }
      };
      fetchReplyProfile();
    }

    // Check if this post is already liked
    const likedPosts = getLikedPosts();
    setIsLiked(likedPosts.has(event.id));
  }, [event.pubkey, event.id]);

  const handleLike = async () => {
    if (isLiking) return;

    const newLikedState = !isLiked;
    setIsLiking(true);
    setIsLiked(newLikedState); // Optimistic update

    // Update localStorage
    const likedPosts = getLikedPosts();
    if (newLikedState) {
      likedPosts.add(event.id);
    } else {
      likedPosts.delete(event.id);
    }
    saveLikedPosts(likedPosts);

    try {
      await api.reactToPost(event.id, '+');
    } catch (err) {
      console.error('Failed to react to post:', err);
      // Revert on error
      setIsLiked(isLiked);
      const likedPosts = getLikedPosts();
      if (isLiked) {
        likedPosts.add(event.id);
      } else {
        likedPosts.delete(event.id);
      }
      saveLikedPosts(likedPosts);
    } finally {
      setIsLiking(false);
    }
  };

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
          <div className="post-meta-top">
            <span className="post-author" title={event.pubkey}>{displayName}</span>
            <span className="post-pubkey">@{event.pubkey}</span>
            <span className="post-date">{relativeTime}</span>
          </div>
          {replyToPubkey && (
            <div className="post-reply-to">
              Replying to <span className="reply-name">@{replyToProfile?.display_name || replyToProfile?.name || shortenPubkey(replyToPubkey)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="post-content">
        {event.content}
      </div>

      <div className="post-actions">
        <button className="action-btn" onClick={() => setShowCommentModal(true)}>
          <span className="action-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </span>
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
        </button>
        <button
          className={`action-btn ${isLiked ? 'liked' : ''}`}
          onClick={handleLike}
          disabled={isLiking}
        >
          <span className="action-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </span>
        </button>
        <button className="action-btn">
          <span className="action-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </span>
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

      {showCommentModal && (
        <CommentModal
          post={event}
          authorName={displayName}
          authorAvatar={avatarUrl || undefined}
          onClose={() => setShowCommentModal(false)}
          onCommentPosted={() => {
            // Optionally refresh feed or show success message
          }}
        />
      )}

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
          flex-direction: column;
          gap: 2px;
        }

        .post-meta-top {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .post-author {
          font-weight: 600;
          font-size: 15px;
          color: var(--text-primary);
        }

        .post-pubkey {
          font-size: 13px;
          color: #6b7280;
          font-weight: 400;
        }

        .post-reply-to {
          font-size: 13px;
          color: var(--text-muted);
        }

        .reply-name {
          color: var(--accent-color, #7c4dff);
          cursor: pointer;
        }

        .reply-name:hover {
          text-decoration: underline;
        }

        .post-date {
          font-size: 14px;
          color: var(--text-muted);
          margin-left: auto;
          flex-shrink: 0;
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
          gap: 16px;
          padding-left: 52px;
        }

        .action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
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

        .action-btn.liked {
          color: #f91880;
        }

        .action-btn.liked:hover {
          color: #ff1a8c;
        }

        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .action-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .action-icon svg {
          display: block;
        }

        .share-btn {
          margin-left: auto;
        }
      `}</style>
    </div>
  );
};

export default PostCard;
