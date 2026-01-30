import React, { useState } from 'react';
import { api } from '../services/api';
import { generateGradient, getInitials } from '../utils/format';

const Search: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const response = await api.searchUsers(query);
      // Backend returns either { profile: {...} } for pubkey search
      // or { results: [...] } for name search
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

  return (
    <div className="search-view">
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          placeholder="Search for names or pubkeys..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHasSearched(false); // Reset search state when typing
          }}
          className="search-input glass"
        />
        <button type="submit" disabled={loading} className="search-btn">
          {loading ? '...' : 'Search'}
        </button>
      </form>

      <div className="search-results">
        {loading && <div className="loading-results">Searching...</div>}

        {!loading && hasSearched && results.length === 0 && (
          <div className="no-results">No profiles found for "{query}"</div>
        )}

        {results.map((profile) => {
          const displayName = profile.display_name || profile.name || 'Anonymous';
          const pubkey = profile._pubkey || profile.pubkey; // Backend returns _pubkey
          const hasImage = profile.picture && !imageErrors.has(pubkey);
          const gradient = generateGradient(pubkey);
          const initials = getInitials(displayName);

          return (
            <div key={pubkey} className="profile-card card glass">
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
                <div className="profile-name">{displayName}</div>
                <div className="profile-pubkey">{pubkey?.substring(0, 16)}...</div>
                {profile.about && <div className="profile-about">{profile.about}</div>}
              </div>
              <button className="follow-btn">Follow</button>
            </div>
          );
        })}
      </div>

      <style>{`
        .search-form {
          display: flex;
          gap: 12px;
          margin-bottom: 30px;
        }

        .search-input {
          flex: 1;
          padding: 14px 20px;
          border-radius: 12px;
          border: 1px solid var(--border-color);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 16px;
        }

        .search-btn {
          background: var(--accent-color);
          color: white;
          padding: 0 24px;
          border-radius: 12px;
          font-weight: 600;
          border: none;
          cursor: pointer;
        }

        .profile-card {
          display: flex;
          padding: 20px;
          gap: 15px;
          align-items: center;
          margin-bottom: 15px;
        }

        .profile-avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
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
        }

        .profile-name {
          font-weight: 700;
          font-size: 16px;
        }

        .profile-pubkey {
          font-size: 12px;
          color: var(--text-muted);
          font-family: monospace;
        }

        .profile-about {
          font-size: 14px;
          color: var(--text-secondary);
          margin-top: 4px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .follow-btn {
          background: white;
          color: black;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 700;
          font-size: 14px;
          border: none;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};

export default Search;
