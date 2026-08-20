import React, { useState, useEffect, useCallback } from 'react';
import { TABLE_SCHEMAS } from '../constants';
import { listRecords, verifyRecord, ApiError, VERIFY_PRESENTATION } from '../api';

const toError = (err) =>
  err instanceof ApiError
    ? { text: err.message, ref: err.ref, retryable: err.retryable, kind: err.kind }
    : { text: 'Something went wrong. Please try again.', retryable: true, kind: 'server' };

const VerificationTable = ({ currentTable, setCurrentTable, verifiableTables, onSessionExpired }) => {
  const schema = TABLE_SCHEMAS[currentTable];
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRecordId, setSelectedRecordId] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState(null);

  // If session falls down it will outomatickly return the login page
  const handleFailure = useCallback((err, set) => {
    if (err instanceof ApiError && err.kind === 'auth') {
      onSessionExpired?.();
      return;
    }
    set(toError(err));
  }, [onSessionExpired]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedRecordId(null);
    try {
      setData(await listRecords(currentTable));
    } catch (err) {
      handleFailure(err, setError);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [currentTable, handleFailure]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const runVerification = useCallback(async (recordId) => {
    setModalOpen(true);
    setVerifying(true);
    setVerifyResult(null);
    setVerifyError(null);
    try {
      setVerifyResult(await verifyRecord(currentTable, recordId));
    } catch (err) {
      handleFailure(err, setVerifyError);
    } finally {
      setVerifying(false);
    }
  }, [currentTable, handleFailure]);

  const previewFields = schema.fields.filter((f) => f.name !== schema.idField);
  const colSpan = previewFields.length + 2;

  const presentation =
    verifyResult && (VERIFY_PRESENTATION[verifyResult.status] || {
      tone: 'warning',
      icon: '❓',
      title: verifyResult.status,
    });

  return (
    <section className="view-section active">
      <div className="section-header" style={{ animation: 'fadeIn 0.5s ease' }}>
        <h2>Verification</h2>
      </div>

      <div className="pill-nav">
        {verifiableTables.map((table) => (
          <button
            key={table}
            className={`pill-btn ${currentTable === table ? 'active' : ''}`}
            onClick={() => setCurrentTable(table)}
          >
            {table}
          </button>
        ))}
      </div>

      <div className="card table-card" style={{ animation: 'scaleIn 0.4s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <h3>{schema.title} Records</h3>
            <button
              className="primary-btn"
              style={{ padding: '0.4rem 1rem', minWidth: 'auto', fontSize: '0.9rem' }}
              onClick={() => selectedRecordId && runVerification(selectedRecordId)}
              disabled={!selectedRecordId || verifying}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" style={{ verticalAlign: 'middle', marginRight: '4px' }}>
                <path strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Verify Selected
            </button>
          </div>
          <button onClick={loadData} className="btn-small" title="Refresh Data" disabled={loading} style={{ background: 'transparent', borderColor: 'var(--text-muted)', color: 'var(--text-muted)' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none">
              <path strokeWidth="2" d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16" />
            </svg>
            <span style={{ marginLeft: '0.25rem' }}>Refresh</span>
          </button>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>Select</th>
                <th>ID</th>
                {previewFields.map((f) => <th key={f.name}>{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colSpan} style={{ textAlign: 'center', padding: '2rem' }}>
                    <div className="spinner" style={{ margin: '0 auto' }}></div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={colSpan} style={{ textAlign: 'center', padding: '2rem' }}>
                    <div className="inline-alert error" style={{ justifyContent: 'center' }}>
                      <div className="inline-alert-body">
                        <strong>{error.text}</strong>
                        {error.ref && <span className="inline-alert-note">Reference: {error.ref}</span>}
                      </div>
                      {error.retryable && (
                        <button type="button" className="btn-small" onClick={loadData}>Retry</button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                    No records found.
                  </td>
                </tr>
              ) : (
                data.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => setSelectedRecordId(record.id)}
                    style={{ cursor: 'pointer', background: selectedRecordId === record.id ? 'var(--bg-secondary)' : 'transparent' }}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="radio"
                        name="recordSelection"
                        checked={selectedRecordId === record.id}
                        onChange={() => setSelectedRecordId(record.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td><strong>{record.id}</strong></td>
                    {previewFields.map((f) => (
                      <td key={f.name}>{record.content[f.name] ?? '-'}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target.className === 'modal-overlay') setModalOpen(false); }}>
          <div className="modal-content">
            <button className="close-modal" onClick={() => setModalOpen(false)}>×</button>

            {verifying ? (
              <div className="modal-state">
                <div className="large-spinner"></div>
                <h2>Checking the blockchain...</h2>
              </div>
            ) : verifyError ? (
              <div className="modal-state">
                <div className="status-banner danger">
                  <div className="status-icon">⚠️</div>
                  <h3>{verifyError.text}</h3>
                </div>
                {verifyError.ref && <p className="inline-alert-note">Reference: {verifyError.ref}</p>}
                {verifyError.retryable && (
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => runVerification(selectedRecordId)}
                  >
                    Try again
                  </button>
                )}
              </div>
            ) : verifyResult ? (
              <div className="modal-state">
                <div className={`status-banner ${presentation.tone}`}>
                  <div className="status-icon">{presentation.icon}</div>
                  <h3>{verifyResult.message}</h3>
                </div>
                <div className="hash-details">
                  <div className="hash-box">
                    <span>Local Hash</span>
                    <code>{verifyResult.dbHash || 'Not available'}</code>
                  </div>
                  <div className="hash-box">
                    <span>Blockchain Original Hash</span>
                    <code>{verifyResult.chainHash || 'Not anchored yet'}</code>
                  </div>
                  <div className="hash-box">
                    <span>Transaction Hash</span>
                    <code>{verifyResult.txHash || 'Not available'}</code>
                  </div>
                  {verifyResult.anchoredBy && (
                    <div className="hash-box">
                      <span>Anchored By</span>
                      <code>{verifyResult.anchoredBy}{verifyResult.blockNumber ? ` · block ${verifyResult.blockNumber}` : ''}</code>
                    </div>
                  )}
                </div>
                {verifyResult.status === 'PENDING' && (
                  <button type="button" className="btn-small" onClick={() => runVerification(selectedRecordId)}>
                    Check again
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
};

export default VerificationTable;
