import React, { useState } from 'react';
import Header from './components/Header';
import AddRecordForm from './components/AddRecordForm';
import VerificationTable from './components/VerificationTable';
import { ALL_TABLES, VERIFIABLE_TABLES } from './constants';

function App() {
  const [activeTab, setActiveTab] = useState('add');
  const [addTable, setAddTable] = useState('production');
  const [verifyTable, setVerifyTable] = useState('production');

  return (
    <>
      <div className="app-background">
        <div className="glow-orb orb-1"></div>
        <div className="glow-orb orb-2"></div>
      </div>

      <div className="app-container">
        <Header activeTab={activeTab} setActiveTab={setActiveTab} />
        
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
