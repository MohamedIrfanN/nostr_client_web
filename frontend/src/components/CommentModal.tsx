import React, { useState } from 'react';
import type { NostrEvent } from '../services/api';
import { api } from '../services/api';
import { formatRelativeTime, generateGradient, getInitials, shortenPubkey } from '../utils/format';

interface CommentModalProps {
  post: NostrEvent;
  authorName: string;
  authorAvatar?: string;
  onClose: () => void;
  onCommentPosted: () => void;
}

const CommentModal: React.FC<CommentModalProps> = ({
  post,
  authorName,
  authorAvatar,
  onClose,
  onCommentPosted,
}) => {
  const [comment, setComment] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  const handleReply = async () => {
    if (!comment.trim() || isPosting) return;

    setIsPosting(true);
    try {
      // Post as a proper NIP-10 reply
      await api.postComment(post.id, post.pubkey, comment);
      setComment('');
      onCommentPosted();
      onClose();
    } catch (error) {
      console.error('Failed to post comment:', error);
      alert('Failed to post comment. Please try again.');
    } finally {
      setIsPosting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const gradient = generateGradient(post.pubkey);
  const initials = getInitials(authorName);

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="comment-modal">
        <div className="modal-header">
          <h3>Reply</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="replying-to">
          <div className="reply-avatar" style={{ background: authorAvatar ? 'transparent' : gradient }}>
            {authorAvatar ? (
              <img src={authorAvatar} alt={authorName} />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="reply-content">
            <div className="reply-header">
              <span className="reply-author">{authorName}</span>
              <span className="reply-time">{formatRelativeTime(post.created_at)}</span>
            </div>
            <div className="reply-text">{post.content}</div>
          </div>
        </div>

        <div className="comment-input-section">
          <textarea
            placeholder="What's on your mind?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isPosting}
            autoFocus
          />
        </div>

        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose} disabled={isPosting}>
            Cancel
          </button>
          <button
            className="reply-btn"
            onClick={handleReply}
            disabled={!comment.trim() || isPosting}
          >
            {isPosting ? 'Posting...' : 'Reply'}
          </button>
        </div>

        <style>{`
          .modal-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            backdrop-filter: blur(4px);
          }

          .comment-modal {
            background: var(--bg-card);
            border-radius: 16px;
            width: 90%;
            max-width: 600px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            border: 1px solid var(--border-color);
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          }

          .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px 24px;
            border-bottom: 1px solid var(--border-color);
          }

          .modal-header h3 {
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary);
            margin: 0;
          }

          .close-btn {
            background: none;
            border: none;
            color: var(--text-muted);
            font-size: 32px;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: var(--transition);
            line-height: 1;
          }

          .close-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: var(--text-primary);
          }

          .replying-to {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            gap: 12px;
          }

          .reply-avatar {
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

          .reply-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .reply-content {
            flex: 1;
            min-width: 0;
          }

          .reply-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
          }

          .reply-author {
            font-weight: 600;
            font-size: 15px;
            color: var(--text-primary);
          }

          .reply-time {
            font-size: 14px;
            color: var(--text-muted);
          }

          .reply-text {
            font-size: 15px;
            line-height: 1.5;
            color: var(--text-secondary);
            word-break: break-word;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .comment-input-section {
            padding: 24px;
            flex: 1;
            overflow-y: auto;
          }

          .comment-input-section textarea {
            width: 100%;
            min-height: 120px;
            background: transparent;
            border: none;
            color: var(--text-primary);
            font-size: 16px;
            resize: vertical;
            font-family: inherit;
            outline: none;
          }

          .comment-input-section textarea::placeholder {
            color: var(--text-muted);
          }

          .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            padding: 20px 24px;
            border-top: 1px solid var(--border-color);
          }

          .cancel-btn,
          .reply-btn {
            padding: 10px 24px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 15px;
            border: none;
            cursor: pointer;
            transition: var(--transition);
          }

          .cancel-btn {
            background: transparent;
            color: var(--text-secondary);
          }

          .cancel-btn:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.08);
            color: var(--text-primary);
          }

          .reply-btn {
            background: var(--accent-color);
            color: white;
          }

          .reply-btn:hover:not(:disabled) {
            background: var(--accent-hover);
          }

          .reply-btn:disabled,
          .cancel-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    </div>
  );
};

export default CommentModal;
