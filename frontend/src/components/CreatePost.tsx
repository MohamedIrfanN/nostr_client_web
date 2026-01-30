import React, { useState } from 'react';
import { api } from '../services/api';

interface CreatePostProps {
  onPostCreated: () => void;
}

const CreatePost: React.FC<CreatePostProps> = ({ onPostCreated }) => {
  const [content, setContent] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  const handlePublish = async () => {
    if (!content.trim()) return;
    setIsPublishing(true);
    try {
      await api.publishNote(content);
      setContent('');
      onPostCreated();
    } catch (error) {
      console.error('Failed to publish note:', error);
      alert('Failed to publish note.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="create-post-card">
      <textarea
        placeholder="What's on your mind?"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={isPublishing}
      />
      <div className="publish-actions">
        <span></span>
        <button
          onClick={handlePublish}
          disabled={isPublishing || !content.trim()}
          className="publish-btn"
        >
          {isPublishing ? 'Publishing...' : 'Publish'}
        </button>
      </div>

      <style>{`
        .create-post-card {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-color);
        }

        textarea {
          width: 100%;
          min-height: 80px;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-size: 16px;
          resize: none;
          margin-bottom: 12px;
          font-family: inherit;
        }

        textarea::placeholder {
          color: var(--text-muted);
        }

        textarea:focus {
          outline: none;
        }

        .publish-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .publish-btn {
          background: var(--accent-color);
          color: white;
          padding: 8px 20px;
          border-radius: 20px;
          font-weight: 600;
          font-size: 14px;
          border: none;
          cursor: pointer;
          transition: var(--transition);
        }

        .publish-btn:hover:not(:disabled) {
          background: var(--accent-hover);
        }

        .publish-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default CreatePost;
