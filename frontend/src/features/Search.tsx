import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { generateGradient, getInitials, formatPubkey } from '../utils/format';
import { getCurrentUser } from '../services/profileCache';
import LoadingSpinner from '../components/LoadingSpinner';

import { wsService } from '../services/websocket';
import { setProfileToCache } from '../services/profileCache';

const Search: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [hoveringUnfollow, setHoveringUnfollow] = useState<string | null>(null);

  const searchCleanupRef = React.useRef<(() => void) | null>(null);

  const currentUser = getCurrentUser();
  const myPubkey = currentUser?.pubkey;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchCleanupRef.current) searchCleanupRef.current();
    };
  }, []);

  // Fetch initial following list
  useEffect(() => {
    if (myPubkey) {
      api.getMyFollowing().then(list => {
        setFollowingSet(new Set(list));
      }).catch(err => console.error("Failed to fetch following list", err));
    }
  }, [myPubkey]);

  // Auto-search logic
  useEffect(() => {
    const q = query.trim();

    // Reset if query is too short
    if (q.length < 2) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      if (searchCleanupRef.current) {
        searchCleanupRef.current();
        searchCleanupRef.current = null;
      }
      return;
    }

    // Debounce: wait 500ms after last keystroke
    const timer = setTimeout(() => {
      performSearch(q);
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  const performSearch = (q: string) => {
    // Stop any existing search
    if (searchCleanupRef.current) searchCleanupRef.current();

    setResults([]);
    setLoading(true);
    setHasSearched(true);

    const cleanup = wsService.connect(
      `search?q=${encodeURIComponent(q)}`,
      (message) => {
        if (message.type === 'profile' && message.profile) {
          const newProfile = message.profile;
          const pk = newProfile.pubkey || newProfile._pubkey;

          // Warm the global profile cache immediately so Profile view can find it
          setProfileToCache(pk, newProfile);

          setResults(prev => {
            const index = prev.findIndex(p => (p.pubkey || p._pubkey) === pk);

            if (index !== -1) {
              const existing = prev[index];
              const existingTs = existing._created_at || existing.created_at || 0;
              const newTs = newProfile._created_at || newProfile.created_at || 0;

              if (newTs > existingTs) {
                const next = [...prev];
                next[index] = newProfile;
                return next;
              }
              return prev;
            }
            return [...prev, newProfile];
          });
        }
        if (message.type === 'eose') {
          setLoading(false);
          cleanup();
        }
      },
      (err) => {
        console.error('Search WS error:', err);
        setLoading(false);
      }
    );

    searchCleanupRef.current = cleanup;

    // Safety timeout (10s)
    setTimeout(() => {
      if (searchCleanupRef.current === cleanup) {
        setLoading(false);
        cleanup();
      }
    }, 10000);
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
      <div className="search-form">
        <input
          type="text"
          placeholder="Search for names or pubkeys..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input glass"
          autoFocus
        />
      </div>

      <div className="search-results">
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
              onClick={() => (window as any).navigateToProfile?.(pubkey, profile)}
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

        {loading && (
          <div className="loading-results-bottom">
            <LoadingSpinner label="Seeking more profiles..." size="small" />
          </div>
        )}

        {!loading && hasSearched && results.length === 0 && query.trim().length >= 2 && (
          <div className="no-results">No profiles found for "{query}"</div>
        )}
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

        .loading-results-bottom {
          display: flex;
          justify-content: center;
          padding: 30px 0;
          color: var(--text-muted);
          border-top: 1px solid var(--border-color);
          margin-top: 10px;
        }

        .no-results {
          text-align: center;
          padding: 60px 20px;
          color: var(--text-muted);
          background: rgba(255, 255, 255, 0.02);
          border-radius: 12px;
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
