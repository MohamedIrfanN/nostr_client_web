import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { generateGradient, getInitials, formatPubkey } from '../utils/format';
import { getCurrentUser } from '../services/profileCache';
import LoadingSpinner from '../components/LoadingSpinner';

const Search: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [hoveringUnfollow, setHoveringUnfollow] = useState<string | null>(null);

  const currentUser = getCurrentUser();
  const myPubkey = currentUser?.pubkey;

  // Fetch initial following list
  useEffect(() => {
    if (myPubkey) {
      api.getMyFollowing().then(list => {
        setFollowingSet(new Set(list));
      }).catch(err => console.error("Failed to fetch following list", err));
    }
  }, [myPubkey]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const response = await api.searchUsers(query);
      if (response.profile) {
        setResults(response.profile ? [response.profile] : []);
      } else if (response.results) {
        setResults(response.results);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleImageError = (pubkey: string) => {
    setImageErrors(prev => new Set(prev).add(pubkey));
  };

  const handleFollow = async (pubkey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFollowingSet(prev => new Set(prev).add(pubkey));
    try {
      await api.followUser(pubkey);
    } catch (err) {
      console.error('Follow failed', err);
      setFollowingSet(prev => {
        const next = new Set(prev);
        next.delete(pubkey);
        return next;
      });
    }
  };

  const handleUnfollow = async (pubkey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFollowingSet(prev => {
      const next = new Set(prev);
      next.delete(pubkey);
      return next;
    });
    try {
      await api.unfollowUser(pubkey);
    } catch (err) {
      console.error('Unfollow failed', err);
      setFollowingSet(prev => new Set(prev).add(pubkey));
    }
  };

  return (
    <div className="search-view">
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          placeholder="Search for names or pubkeys..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHasSearched(false);
          }}
          className="search-input glass"
        />
        <button type="submit" disabled={loading} className="search-btn">
          {loading ? <LoadingSpinner size="small" color="white" padding="0" /> : 'Search'}
        </button>
      </form>

      <div className="search-results">
        {loading && (
          <div className="loading-results">
            <LoadingSpinner label="Searching for profiles..." size="medium" />
          </div>
        )}

        {!loading && hasSearched && results.length === 0 && (
          <div className="no-results">No profiles found for "{query}"</div>
        )}

        {results.map((profile) => {
          const displayName = profile.display_name || profile.name || 'Anonymous';
          const pubkey = profile._pubkey || profile.pubkey;
          const hasImage = profile.picture && !imageErrors.has(pubkey);
          const gradient = generateGradient(pubkey);
          const initials = getInitials(displayName);
          const handle = profile.name ? `@${profile.name}` : formatPubkey(pubkey);

          const isMe = myPubkey === pubkey;
          const isFollowing = followingSet.has(pubkey);
          const isHovering = hoveringUnfollow === pubkey;

          return (
            <div
              key={pubkey}
              className="profile-card card glass"
              onClick={() => (window as any).navigateToProfile?.(pubkey)}
              style={{ cursor: 'pointer' }}
            >
              <div
                className="profile-avatar"
                style={{ background: hasImage ? 'transparent' : gradient }}
              >
                {hasImage ? (
                  <img
                    src={profile.picture}
                    alt={displayName}
                    onError={() => handleImageError(pubkey)}
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className="profile-info">
                <div className="profile-header-row">
                  <div className="profile-name">{displayName}</div>
                  <div className="profile-handle">{handle}</div>
                </div>
                {profile.about && <div className="profile-about">{profile.about}</div>}
              </div>

              {!isMe && (
                isFollowing ? (
                  <button
                    className={`follow-btn following-btn ${isHovering ? 'unfollow-danger' : ''}`}
                    onClick={(e) => handleUnfollow(pubkey, e)}
                    onMouseEnter={() => setHoveringUnfollow(pubkey)}
                    onMouseLeave={() => setHoveringUnfollow(null)}
                  >
                    {isHovering ? 'Unfollow' : 'Following'}
                  </button>
                ) : (
                  <button
                    className="follow-btn follow-primary"
                    onClick={(e) => handleFollow(pubkey, e)}
                  >
                    Follow
                  </button>
                )
              )}

              {isMe && <span className="is-me-badge">You</span>}
            </div>
          );
        })}
      </div>

      <style>{`
        .search-form {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
        }

        .search-input {
          flex: 1;
          padding: 12px 20px;
          border-radius: 24px;
          border: 1px solid var(--border-color);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 15px;
          transition: border-color 0.2s;
        }

        .search-input:focus {
          border-color: var(--accent-color);
          outline: none;
        }

        .search-btn {
          background: var(--accent-color);
          color: white;
          padding: 0 24px;
          border-radius: 24px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          font-size: 14px;
          transition: opacity 0.2s;
        }

        .search-btn:hover {
          opacity: 0.9;
        }

        .search-results {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .profile-card {
          display: flex;
          padding: 16px;
          gap: 16px;
          align-items: center;
          transition: background 0.2s ease;
          border: 1px solid var(--border-color);
          border-radius: 12px;
        }
        
        .profile-card:hover {
          background: rgba(255, 255, 255, 0.03);
          border-color: var(--accent-color);
        }

        .profile-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 700;
          flex-shrink: 0;
          color: white;
          overflow: hidden;
        }

        .profile-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .profile-info {
          flex: 1;
          min-width: 0;
        }

        .profile-header-row {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-bottom: 4px;
        }

        .profile-name {
          font-weight: 700;
          font-size: 15px;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .profile-handle {
          font-size: 13px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .profile-about {
          font-size: 14px;
          color: var(--text-secondary);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.4;
        }

        .follow-btn {
          background: white;
          color: black;
          padding: 6px 16px;
          border-radius: 20px;
          font-weight: 700;
          font-size: 13px;
          border: none;
          cursor: pointer;
          transition: opacity 0.2s;
          flex-shrink: 0;
        }

        .follow-btn:hover {
          opacity: 0.9;
        }

        .is-me-badge {
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-muted);
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
};

export default Search;
