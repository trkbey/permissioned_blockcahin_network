import React, { useState, useRef } from 'react';
import { TABLE_SCHEMAS } from '../constants';
import { createRecord, ApiError } from '../api';

const AddRecordForm = ({ currentTable, setCurrentTable, allTables, canWrite, onSessionExpired }) => {
  const schema = TABLE_SCHEMAS[currentTable];
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const formRef = useRef(null);
  // The failed submission is saved to try again without refilling the form
  const lastPayload = useRef(null);

  const fieldErrors = {};
  if (status?.type === 'error' && Array.isArray(status.details)) {
    status.details.forEach((d) => {
      if (d && d.field) fieldErrors[d.field] = d.message;
    });
  }

  const submit = async (payload) => {
    setLoading(true);
    setStatus(null);
    lastPayload.current = payload;

    try {
      const result = await createRecord(currentTable, payload);
      setStatus({
        type: 'success',
        text: result.message || 'Record saved.',
        anchoring: result.anchoring,
      });
      formRef.current?.reset();
      lastPayload.current = null;
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'auth') {
        onSessionExpired?.();
      } else if (err instanceof ApiError) {
        setStatus({
          type: 'error',
          text: err.message,
          details: err.details,
          ref: err.ref,
          retryable: err.retryable,
        });
      } else {
        setStatus({ type: 'error', text: 'Something went wrong. Please try again.', retryable: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {};
    schema.fields.forEach((f) => {
      payload[f.name] = formData.get(f.name);
    });
    submit(payload);
  };

  const handleRetry = () => {
    if (lastPayload.current) submit(lastPayload.current);
  };

  if (!canWrite) {
    return (
      <section className="view-section active">
        <div className="section-header"><h2>Add Data</h2></div>
        <div className="card form-card">
          <div className="status-banner warning">
            <div className="status-icon">🔒</div>
            <h3>Your API key has the <code>reader</code> role, so adding records is disabled.</h3>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="view-section active">
      <div className="section-header" style={{ animation: 'fadeIn 0.5s ease' }}>
        <h2>Add Data</h2>
      </div>

      <div className="pill-nav">
        {allTables.map((table) => (
          <button
            key={table}
            className={`pill-btn ${currentTable === table ? 'active' : ''}`}
            onClick={() => { setCurrentTable(table); setStatus(null); lastPayload.current = null; }}
          >
            {table}
          </button>
        ))}
      </div>

      <div className="card form-card" style={{ animation: 'scaleIn 0.4s ease' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h3>{`Add ${schema.title} Record`}</h3>
        </div>

        {status && (
          <div className={`inline-alert ${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>
            <div className="inline-alert-body">
              <strong>{status.text}</strong>
              {status.type === 'success' && status.anchoring === 'PENDING' && (
                <span className="inline-alert-note">
                  Blockchain anchoring is queued — it usually completes within a few seconds.
                </span>
              )}
              {status.type === 'error' && Array.isArray(status.details) && status.details.length > 0 && (
                <ul className="inline-alert-list">
                  {status.details.map((d, i) => (
                    <li key={i}>{d.field ? `${d.field} ${d.message}` : d.message}</li>
                  ))}
                </ul>
              )}
              {status.ref && <span className="inline-alert-note">Reference: {status.ref}</span>}
            </div>
            {status.type === 'error' && status.retryable && lastPayload.current && (
              <button type="button" className="btn-small" onClick={handleRetry} disabled={loading}>
                Retry
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} ref={formRef}>
          <div className="form-grid">
            {schema.fields.map((field) => (
              <div key={field.name} className="form-group">
                <label htmlFor={field.name}>{field.label}</label>
                <input
                  type={field.type === 'number' ? 'text' : field.type}
                  inputMode={field.type === 'number' ? (field.step ? 'decimal' : 'numeric') : 'text'}
                  id={field.name}
                  name={field.name}
                  className={`form-control ${fieldErrors[field.name] ? 'has-error' : ''}`}
                  placeholder={`Enter ${field.label}...`}
                  aria-invalid={fieldErrors[field.name] ? 'true' : undefined}
                  required
                  onInput={(e) => {
                    let val = e.target.value;
                    if (field.type === 'number') {
                      if (!field.step) {
                        val = val.replace(/[^0-9]/g, '');
                      } else {
                        val = val.replace(/[^0-9.]/g, '');
                        const parts = val.split('.');
                        if (parts.length > 2) {
                          val = parts[0] + '.' + parts.slice(1).join('');
                        }
                      }
                    } else if (field.type === 'text') {
                      const numberAllowed = ['code', 'model', 'product_name', 'team'].some((kw) =>
                        field.name.includes(kw)
                      );
                      if (!numberAllowed) {
                        val = val.replace(/[0-9]/g, '');
                      }
                    }
                    if (e.target.value !== val) {
                      e.target.value = val;
                    }
                  }}
                />
                {fieldErrors[field.name] && (
                  <span className="field-error">{fieldErrors[field.name]}</span>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? <div className="spinner"></div> : <span>Save</span>}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default AddRecordForm;
