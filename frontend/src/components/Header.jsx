import React from 'react';

const Header = ({ activeTab, setActiveTab, isDarkMode, toggleDarkMode }) => {
  return (
    <header className="app-header">
      <div className="logo">
        <div className="logo-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10">
            </path>
          </svg>
        </div>
        <h1>TableVerifier</h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <nav className="main-tabs">
          <button 
            className={`main-tab-btn ${activeTab === 'add' ? 'active' : ''}`}
          onClick={() => setActiveTab('add')}
        >
          <span>+</span> Add
        </button>
        <button 
          className={`main-tab-btn ${activeTab === 'verify' ? 'active' : ''}`}
          onClick={() => setActiveTab('verify')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor">
            <path strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Verify
        </button>
      </nav>
      <button 
        onClick={toggleDarkMode}
        className="btn-small"
        title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        style={{ padding: '0.4rem', borderRadius: '50%', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px' }}
      >
        {isDarkMode ? '☀️' : '🌙'}
      </button>
      </div>
    </header>
  );
};

export default Header;
