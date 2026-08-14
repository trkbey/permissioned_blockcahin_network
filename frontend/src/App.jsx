import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import AddRecordForm from './components/AddRecordForm';
import VerificationTable from './components/VerificationTable';
import { ALL_TABLES, VERIFIABLE_TABLES } from './constants';

function App() {
  const [activeTab, setActiveTab] = useState('add');
  const [addTable, setAddTable] = useState('production');
  const [verifyTable, setVerifyTable] = useState('production');
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  return (
    <>

      <div className="app-container">
        <Header 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
        />
        
        <main className="content-wrapper">
          {activeTab === 'add' && (
            <AddRecordForm 
              currentTable={addTable} 
              setCurrentTable={setAddTable} 
              allTables={ALL_TABLES} 
            />
          )}

          {activeTab === 'verify' && (
            <VerificationTable 
              currentTable={verifyTable} 
              setCurrentTable={setVerifyTable} 
              verifiableTables={VERIFIABLE_TABLES} 
            />
          )}
        </main>
      </div>
    </>
  );
}

export default App;
