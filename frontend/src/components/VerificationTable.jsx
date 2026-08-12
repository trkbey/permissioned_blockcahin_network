import React, { useState, useEffect } from 'react';
import { TABLE_SCHEMAS, API_BASE_URL } from '../constants';

const VerificationTable = ({ currentTable, setCurrentTable, verifiableTables }) => {
  const schema = TABLE_SCHEMAS[currentTable];
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/records/${currentTable}`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      } else {
        setError("Failed to load data.");
      }
    } catch (err) {
      setError("Connection error.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentTable]);

  const verifyRecord = async (recordId) => {
    setModalOpen(true);
    setVerifying(true);
    setVerifyResult(null);

    try {
      const response = await fetch(`${API_BASE_URL}/verify/${currentTable}/${recordId}`);
      const result = await response.json();
      setVerifyResult(result);
    } catch (err) {
      setVerifyResult({
        success: false,
        message: "Connection error.",
      });
    } finally {
      setVerifying(false);
    }
  };

  const previewFields = schema.fields.filter(f => f.name !== schema.idField);

  return (
    <section className="view-section active">
      <div className="section-header" style={{animation: 'fadeIn 0.5s ease'}}>
        <h2>Verification</h2>
      </div>

      <div className="pill-nav">
        {verifiableTables.map(table => (
          <button 
            key={table}
            className={`pill-btn ${currentTable === table ? 'active' : ''}`}
            onClick={() => setCurrentTable(table)}
          >
            {table}
          </button>
        ))}
      </div>

      <div className="glass-card table-card" style={{animation: 'scaleIn 0.4s ease'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'}}>
          <h3>{schema.title} Records</h3>
          <button onClick={loadData} className="btn-verify-small" title="Refresh Data" style={{background: 'transparent', borderColor: 'var(--text-muted)', color: 'var(--text-muted)'}}>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none">
              <path strokeWidth="2" d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16" />
            </svg>
            <span style={{marginLeft: '0.25rem'}}>Refresh</span>
          </button>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                {previewFields.map(f => <th key={f.name}>{f.label}</th>)}
                <th>Blockchain Operation</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={previewFields.length + 2} style={{textAlign: 'center', padding: '2rem'}}>
                    <div className="spinner" style={{margin: '0 auto'}}></div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={previewFields.length + 2} style={{textAlign: 'center', color: 'var(--danger)', padding: '2rem'}}>
                    {error}
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={previewFields.length + 2} style={{textAlign: 'center', color: 'var(--text-muted)', padding: '2rem'}}>
                    No records found.
                  </td>
                </tr>
              ) : (
                data.map(record => (
                  <tr key={record.id}>
                    <td><strong>{record.id}</strong></td>
                    {previewFields.map(f => (
                      <td key={f.name}>{record.content[f.name] ?? '-'}</td>
                    ))}
                    <td>
                      <button className="btn-verify-small" onClick={() => verifyRecord(record.id)}>
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" style={{verticalAlign: 'middle', marginRight: '4px'}}>
                          <path strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        Verify
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target.className === 'modal-overlay') setModalOpen(false); }}>
          <div className="glass-modal">
            <button className="close-modal" onClick={() => setModalOpen(false)}>×</button>
            <div className="modal-content">
              {verifying ? (
                <div className="modal-state">
                  <div className="large-spinner"></div>
                  <h2>Searching Blockchain...</h2>
                </div>
              ) : verifyResult ? (
                <div className="modal-state">
                  <div className={`status-banner ${verifyResult.success ? 'secure' : 'danger'}`}>
                    <div className="status-icon">{verifyResult.success ? '🛡️' : '⚠️'}</div>
                    <h3>{verifyResult.message}</h3>
                  </div>
                  <div className="hash-details">
                    <div className="hash-box">
                      <span>Local Hash</span>
                      <code>{verifyResult.dbHash || 'Not found'}</code>
                    </div>
                    <div className="hash-box">
                      <span>Blockchain Original Hash</span>
                      <code>{verifyResult.chainHash || 'Not found'}</code>
                    </div>
                    <div className="hash-box" style={{borderColor: verifyResult.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}}>
                      <span>TxHash</span>
                      <code>{verifyResult.verifiedTxHash || verifyResult.fakeTxHash || 'Invalid'}</code>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default VerificationTable;
