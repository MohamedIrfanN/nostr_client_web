import { useState } from 'react'
import './App.css'
import Feed from './features/Feed'
import Search from './features/Search'
import Messages from './features/Messages'
import Profile from './features/Profile'
import LoadingSpinner from './components/LoadingSpinner'
import { api } from './services/api'
import { useEffect } from 'react'
import { shortenPubkey, generateGradient, getInitials } from './utils/format'

type Tab = 'home' | 'search' | 'messages' | 'profile';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [currentUser, setCurrentUser] = useState<{ pubkey: string; profile?: any } | null>(null);

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const me = await api.getMe();
        setCurrentUser(me);
      } catch (err) {
        console.error('Failed to fetch current user:', err);
      }
    };
    fetchMe();
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Feed />;
      case 'search':
        return <Search />;
      case 'messages':
        return <Messages />;
      case 'profile':
        if (!currentUser) return <LoadingSpinner label="Identifying user..." size="large" />;
        return <Profile pubkey={currentUser.pubkey} profile={currentUser.profile} />;
      default:
        return <Feed />;
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'home': return 'For You';
      case 'search': return 'Search';
      case 'messages': return 'Messages';
      case 'profile': return 'Profile';
      default: return 'For You';
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/knot-logo.png" alt="Knot Logo" className="logo-icon" />
          <h2>Knot</h2>
        </div>

        <nav className="sidebar-nav">
          <ul>
            <li
              className={activeTab === 'home' ? 'active' : ''}
              onClick={() => setActiveTab('home')}
            >
              <span className="icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
              </span>
              <span className="label">Home</span>
            </li>
            <li
              className={activeTab === 'search' ? 'active' : ''}
              onClick={() => setActiveTab('search')}
            >
              <span className="icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
              </span>
              <span className="label">Search</span>
            </li>
            <li
              className={activeTab === 'messages' ? 'active' : ''}
              onClick={() => setActiveTab('messages')}
            >
              <span className="icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </span>
              <span className="label">Messages</span>
            </li>
            <li
              className={activeTab === 'profile' ? 'active' : ''}
              onClick={() => setActiveTab('profile')}
            >
              <span className="icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </span>
              <span className="label">Profile</span>
            </li>
          </ul>
        </nav>

        {currentUser && (
          <div className="sidebar-footer">
            <div className="user-profile">
              <div
                className="user-avatar"
                style={{
                  background: currentUser.profile?.picture ? 'transparent' : generateGradient(currentUser.pubkey)
                }}
              >
                {currentUser.profile?.picture ? (
                  <img src={currentUser.profile.picture} alt={currentUser.profile.name || 'Me'} />
                ) : (
                  <span>{getInitials(currentUser.profile?.display_name || currentUser.profile?.name || currentUser.pubkey)}</span>
                )}
              </div>
              <div className="user-info">
                <div className="user-name">{currentUser.profile?.display_name || currentUser.profile?.name || 'User'}</div>
                <div className="user-handle">@{shortenPubkey(currentUser.pubkey)}</div>
              </div>
              <div className="user-more">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="19" cy="12" r="1"></circle>
                  <circle cx="5" cy="12" r="1"></circle>
                </svg>
              </div>
            </div>
          </div>
        )}
      </aside>

      <main className="main-content">
        <header className="page-header">
          <h1>{getPageTitle()}</h1>
        </header>

        <div className="content-area">
          {renderContent()}
        </div>
      </main>

      <style>{`
        .app-container {
          display: flex;
          background: var(--bg-color);
          min-height: 100vh;
        }

        .sidebar {
          width: 230px;
          height: 100vh;
          position: fixed;
          left: 0;
          top: 0;
          background: var(--bg-color);
          padding: 20px 16px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          border-right: 1px solid var(--border-color);
        }

        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 8px 12px;
        }

        .logo-icon {
          width: 72px;
          height: 72px;
          object-fit: contain;
        }

        .sidebar-logo h2 {
          font-weight: 700;
          font-size: 20px;
          letter-spacing: -0.5px;
          color: var(--text-primary);
          margin: 0;
        }

        .sidebar-nav ul {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .sidebar-nav li {
          padding: 12px 16px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 400;
          font-size: 16px;
          color: var(--text-primary);
          transition: var(--transition);
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .sidebar-nav li:hover:not(.active) {
          background: rgba(255, 255, 255, 0.05);
        }

        .sidebar-nav li.active {
          background: rgba(255, 255, 255, 0.12);
          font-weight: 500;
        }

        .sidebar-nav .icon {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .sidebar-nav .icon svg {
          display: block;
        }

        .sidebar-nav .label {
          flex: 1;
        }

        .main-content {
          flex: 1;
          margin-left: 230px;
          border-right: 1px solid var(--border-color);
          min-height: 100vh;
        }

        .page-header {
          position: sticky;
          top: 0;
          background: rgba(13, 13, 13, 0.95);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          padding: 16px 20px;
          z-index: 10;
          border-bottom: 1px solid var(--border-color);
        }

        .page-header h1 {
          font-size: 20px;
          font-weight: 700;
          margin: 0;
        }

        .content-area {
          padding: 0;
          position: relative;
          height: calc(100vh - 60px);
        }

        @media (max-width: 1024px) {
          .sidebar {
            width: 80px;
            padding: 20px 8px;
          }
          
          .sidebar-logo h2 {
            display: none;
          }

          .sidebar-logo {
            justify-content: center;
            padding: 8px;
          }
          
          .sidebar-nav .label {
            display: none;
          }

          .user-info, .user-more {
            display: none;
          }

          .sidebar-footer {
            padding: 12px 0;
            display: flex;
            justify-content: center;
          }
          
          .user-profile {
            padding: 8px;
            width: fit-content;
          }
        }

        .sidebar-footer {
          margin-top: auto;
          padding: 12px 4px;
        }

        .user-profile {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 9999px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .user-profile:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .user-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 14px;
          flex-shrink: 0;
        }

        .user-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .user-info {
          flex: 1;
          min-width: 0;
        }

        .user-name {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-handle {
          font-size: 15px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-more {
          color: var(--text-primary);
          display: flex;
          align-items: center;
        }
  
          .sidebar-nav li {
            padding: 12px;
            justify-content: center;
          }

            margin-left: 80px;
          }
        }

        @media (max-width: 640px) {
          .sidebar {
            display: none;
          }

          .main-content {
            margin-left: 0;
            border-left: none;
          }
        }
      `}</style>
    </div>
  )
}

export default App
