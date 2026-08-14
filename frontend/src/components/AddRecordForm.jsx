import React, { useState } from 'react';
import { TABLE_SCHEMAS, API_BASE_URL } from '../constants';

const AddRecordForm = ({ currentTable, setCurrentTable, allTables }) => {
  const schema = TABLE_SCHEMAS[currentTable];
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMessage(null);

    const formData = new FormData(e.target);
    const payload = {};
    schema.fields.forEach(f => {
      payload[f.name] = formData.get(f.name);
    });

    try {
      const response = await fetch(`${API_BASE_URL}/records/${currentTable}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      
      if (result.success) {
        setStatusMessage({ type: 'success', text: `✅ ${result.message}` });
        e.target.reset();
      } else {
        setStatusMessage({ type: 'error', text: `❌ error: ${result.message}` });
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: `❌ Connection error` });
    } finally {
      setLoading(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  return (
    <section className="view-section active">
      <div className="section-header" style={{animation: 'fadeIn 0.5s ease'}}>
        <h2>Add Data</h2>
      </div>

      <div className="pill-nav">
        {allTables.map(table => (
          <button 
            key={table}
            className={`pill-btn ${currentTable === table ? 'active' : ''}`}
            onClick={() => { setCurrentTable(table); setStatusMessage(null); }}
          >
            {table}
          </button>
        ))}
      </div>

      <div className="card form-card" style={{animation: 'scaleIn 0.4s ease'}}>
        <div style={{marginBottom: '1.5rem'}}>
          <h3 style={{color: statusMessage?.type === 'success' ? 'var(--success)' : statusMessage?.type === 'error' ? 'var(--danger)' : 'inherit'}}>
            {statusMessage ? statusMessage.text : `Add ${schema.title} Record`}
          </h3>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {schema.fields.map(field => (
              <div key={field.name} className="form-group">
                <label htmlFor={field.name}>{field.label}</label>
                <input 
                  type={field.type === 'number' ? 'text' : field.type} 
                  inputMode={field.type === 'number' ? (field.step ? 'decimal' : 'numeric') : 'text'}
                  id={field.name} 
                  name={field.name} 
                  className="form-control" 
                  placeholder={`Enter ${field.label}...`} 
                  required 
                  onInput={(e) => {
                    let val = e.target.value;
                    if (field.type === 'number') {
                      if (!field.step) {
                        val = val.replace(/[^0-9]/g, ''); // Sadece rakam
                      } else {
                        val = val.replace(/[^0-9.]/g, ''); // Rakam ve tek nokta
                        const parts = val.split('.');
                        if (parts.length > 2) {
                          val = parts[0] + '.' + parts.slice(1).join('');
                        }
                      }
                    } else if (field.type === 'text') {
                      const numberAllowed = ['code', 'model', 'product_name', 'team'].some(kw => field.name.includes(kw));
                      if (!numberAllowed) {
                        val = val.replace(/[0-9]/g, ''); // Rakamları sil
                      }
                    }
                    if (e.target.value !== val) {
                      e.target.value = val;
                    }
                  }}
                />
              </div>
            ))}
          </div>
          
          <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '1rem'}}>
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
