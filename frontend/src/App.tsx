import { useState } from 'react'
import './App.css'
import Feed from './features/Feed'
import Search from './features/Search'
import Messages from './features/Messages'

type Tab = 'home' | 'search' | 'messages' | 'profile';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Feed />;
      case 'search':
        return <Search />;
      case 'messages':
        return <Messages />;
      case 'profile':
        return (
          <div className="card glass" style={{ padding: '40px', textAlign: 'center' }}>
            <h2>Profile coming soon</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '10px' }}>Your identity on the decentralized web.</p>
          </div>
        );
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
          <div className="logo-icon">K</div>
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
          gap: 12px;
          padding: 8px 12px;
        }

        .logo-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: linear-gradient(135deg, #7c4dff, #9575cd);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 18px;
          color: white;
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
          
          .sidebar-nav li {
            padding: 12px;
            justify-content: center;
          }

          .main-content {
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
