import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import LoginPage from './components/LoginPage';
import AddRecordForm from './components/AddRecordForm';
import VerificationTable from './components/VerificationTable';
import { ALL_TABLES, VERIFIABLE_TABLES } from './constants';
import { me, logout, ApiError } from './api';

function App() {
  const [activeTab, setActiveTab] = useState('add');
  const [addTable, setAddTable] = useState('production');
  const [verifyTable, setVerifyTable] = useState('production');
  const [isDarkMode, setIsDarkMode] = useState(true);

  const [user, setUser] = useState(null);
  // At page load it checks whether there is a session with the existing cookie
  const [checking, setChecking] = useState(true);
  const [fatalError, setFatalError] = useState(null);

  useEffect(() => {
    document.body.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const current = await me();
        if (!cancelled) setUser(current);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.kind !== 'auth') {
          setFatalError({ text: err.message, ref: err.ref });
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const canWrite = user?.role === 'writer';

  // reader cannot acces to add section
  useEffect(() => {
    if (user && !canWrite && activeTab === 'add') setActiveTab('verify');
  }, [user, canWrite, activeTab]);

  const handleSignOut = useCallback(async () => {
    try {
      await logout();
    } catch {
      // We close the local session even if the logout fails on the server
      // If the cookie is already invalid, the user should still see the login screen
    }
    setUser(null);
    setActiveTab('add');
  }, []);

  
  const handleSessionExpired = useCallback(() => setUser(null), []);

  if (checking) {
    return (
      <div className="login-screen">
        <div className="large-spinner"></div>
      </div>
    );
  }

  if (fatalError) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1 className="login-title">Unavailable</h1>
          <div className="login-error">
            <span>{fatalError.text}</span>
            {fatalError.ref && <span className="inline-alert-note">Reference: {fatalError.ref}</span>}
          </div>
          <button className="login-submit" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onSignedIn={setUser} />;
  }

  return (
    <div className="app-container">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDarkMode={isDarkMode}
        toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        client={user}
        canWrite={canWrite}
        onSignOut={handleSignOut}
      />
      <main className="content-wrapper">
        {activeTab === 'add' ? (
          <AddRecordForm
            currentTable={addTable}
            setCurrentTable={setAddTable}
            allTables={ALL_TABLES}
            canWrite={canWrite}
            onSessionExpired={handleSessionExpired}
          />
        ) : (
          <VerificationTable
            currentTable={verifyTable}
            setCurrentTable={setVerifyTable}
            verifiableTables={VERIFIABLE_TABLES}
            onSessionExpired={handleSessionExpired}
          />
        )}
      </main>
    </div>
  );
}

export default App;
