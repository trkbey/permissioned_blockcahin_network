const API_BASE_URL = 'http://localhost:3000/api';

const TABLE_SCHEMAS = {
    date: {
        title: "Date table",
        idField: "date_id",
        fields: [
            { name: "date_id", label: "Date ID (YYYYMMDD)", type: "number" },
            { name: "full_date", label: "Full date", type: "date" },
            { name: "day", label: "Day", type: "number" },
            { name: "month", label: "Month numeric", type: "number" },
            { name: "month_name", label: "Month name", type: "text" },
            { name: "quarter", label: "quarter", type: "number" },
            { name: "year", label: "year", type: "number" },
            { name: "week", label: "week", type: "number" },
            { name: "day_of_week", label: "day of week", type: "text" }
        ]
    },
    product: {
        title: "Product table",
        idField: "product_id",
        fields: [
            { name: "product_id", label: "Id", type: "number" },
            { name: "product_code", label: "Code", type: "text" },
            { name: "product_name", label: "Name", type: "text" },
            { name: "category", label: "Category", type: "text" },
            { name: "model", label: "Model", type: "text" },
            { name: "unit", label: "Unit", type: "text" }
        ]
    },
    machine: {
        title: "Machine table",
        idField: "machine_id",
        fields: [
            { name: "machine_id", label: "Id", type: "number" },
            { name: "machine_code", label: "Code", type: "text" },
            { name: "machine_name", label: "Name", type: "text" },
            { name: "machine_type", label: "Type", type: "text" },
            { name: "manufacturer", label: "Manufacturer", type: "text" },
            { name: "model", label: "Model", type: "text" },
            { name: "installaction_date", label: "Install date", type: "date" }
        ]
    },
    shift: {
        title: "Shift table",
        idField: "shift_id",
        fields: [
            { name: "shift_id", label: "Id", type: "number" },
            { name: "shift_name", label: "Name", type: "text" },
            { name: "start_time", label: "st", type: "time", step: "1" },
            { name: "end_time", label: "et", type: "time", step: "1" }
        ]
    },
    employee: {
        title: "Employee table",
        idField: "employee_id",
        fields: [
            { name: "employee_id", label: "Id", type: "number" },
            { name: "employee_code", label: "Id code", type: "text" },
            { name: "employee_name", label: "Name surname", type: "text" },
            { name: "department", label: "Department", type: "text" },
            { name: "job_position", label: "Position", type: "text" },
            { name: "team", label: "Team", type: "text" }
        ]
    },
    factory: {
        title: "Factory table",
        idField: "factory_id",
        fields: [
            { name: "factory_id", label: "Fabrika ID", type: "number" },
            { name: "factory_name", label: "Fabrika Adı", type: "text" },
            { name: "city", label: "Şehir", type: "text" },
            { name: "country", label: "Ülke", type: "text" },
            { name: "production_area", label: "Üretim Alanı", type: "text" }
        ]
    },
    production: {
        title: "production",
        idField: "production_id",
        fields: [
            { name: "date_id", label: "Daate ID", type: "number" },
            { name: "product_id", label: "Product ID", type: "number" },
            { name: "machine_id", label: "Machine ID", type: "number" },
            { name: "shift_id", label: "Shift ID", type: "number" },
            { name: "employee_id", label: "Employee ID", type: "number" },
            { name: "factory_id", label: "Factory ID", type: "number" },
            { name: "quantity", label: "Quantity", type: "number" },
            { name: "defective_quantity", label: "Defective quantity", type: "number" },
            { name: "production_time_minutes", label: "production time minutes", type: "number" },
            { name: "downtime_minutes", label: "downtime minutes", type: "number" },
            { name: "production_cost", label: "Cost", type: "number", step: "0.01" }
        ]
    }
};

let currentAddTable = 'production';
let currentVerifyTable = 'production';

const mainTabBtns = document.querySelectorAll('.main-tab-btn');
const viewSections = document.querySelectorAll('.view-section');

const addTableNavBtns = document.querySelectorAll('#addTableNav .pill-btn');
const verifyTableNavBtns = document.querySelectorAll('#verifyTableNav .pill-btn');

const dynamicForm = document.getElementById('dynamicForm');
const formInputsContainer = document.getElementById('formInputs');
const formTitle = document.getElementById('formTitle');
const submitBtn = document.getElementById('submitBtn');
const submitSpinner = document.getElementById('submitSpinner');
const btnText = document.querySelector('.btn-text');

const tableTitle = document.getElementById('tableTitle');
const tableHead = document.getElementById('tableHead');
const tableBody = document.getElementById('tableBody');
const refreshBtn = document.getElementById('refreshBtn');

const verifyModal = document.getElementById('verifyModal');
const closeModal = document.getElementById('closeModal');
const modalLoader = document.getElementById('modalLoader');
const modalResult = document.getElementById('modalResult');
const statusBanner = document.getElementById('statusBanner');
const statusIcon = document.getElementById('statusIcon');
const statusMessage = document.getElementById('statusMessage');
const dbHashText = document.getElementById('dbHashText');
const chainHashText = document.getElementById('chainHashText');
const txHashText = document.getElementById('txHashText');

document.addEventListener('DOMContentLoaded', () => {
    initMainTabs();
    initPillNavs();
    renderForm(currentAddTable);
});

function initMainTabs() {
    mainTabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            mainTabBtns.forEach(b => b.classList.remove('active'));
            viewSections.forEach(s => s.classList.remove('active'));

            const targetId = e.currentTarget.getAttribute('data-target');
            e.currentTarget.classList.add('active');
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'verifyData') {
                loadTableData(currentVerifyTable);
            }
        });
    });
}

function initPillNavs() {
    addTableNavBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            addTableNavBtns.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentAddTable = e.currentTarget.getAttribute('data-table');

            formInputsContainer.style.opacity = '0';
            setTimeout(() => {
                renderForm(currentAddTable);
                formInputsContainer.style.opacity = '1';
                formInputsContainer.style.transition = 'opacity 0.3s ease';
            }, 150);
        });
    });

    verifyTableNavBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            verifyTableNavBtns.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentVerifyTable = e.currentTarget.getAttribute('data-table');
            loadTableData(currentVerifyTable);
        });
    });
}

function renderForm(tableName) {
    const schema = TABLE_SCHEMAS[tableName];
    formTitle.textContent = "Add " + schema.title;
    formInputsContainer.innerHTML = '';

    schema.fields.forEach(field => {
        const div = document.createElement('div');
        div.className = 'form-group';

        let extraAttrs = '';
        if (field.step) extraAttrs += ` step="${field.step}"`;

        div.innerHTML = `
            <label for="input_${field.name}">${field.label}</label>
            <input type="${field.type}" id="input_${field.name}" name="${field.name}" class="form-control" placeholder="Enter ${field.label}..." required ${extraAttrs}>
        `;
        formInputsContainer.appendChild(div);
    });
}

dynamicForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    btnText.classList.add('hidden');
    submitSpinner.classList.remove('hidden');
    submitBtn.style.pointerEvents = 'none';

    const schema = TABLE_SCHEMAS[currentAddTable];
    const payload = {};

    schema.fields.forEach(field => {
        payload[field.name] = document.getElementById(`input_${field.name}`).value;
    });

    try {
        const response = await fetch(`${API_BASE_URL}/records/${currentAddTable}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.success) {
            dynamicForm.reset();
            const oldText = formTitle.textContent;
            formTitle.textContent = "✅ " + result.message;
            formTitle.style.color = 'var(--success)';
            setTimeout(() => {
                formTitle.textContent = oldText;
                formTitle.style.color = '';
            }, 3000);
        } else {
            alert("❌ error: " + result.message);
        }
    } catch (error) {
        alert("Connection error");
    } finally {
        btnText.classList.remove('hidden');
        submitSpinner.classList.add('hidden');
        submitBtn.style.pointerEvents = 'auto';
    }
});


async function loadTableData(tableName) {
    const schema = TABLE_SCHEMAS[tableName];
    tableTitle.textContent = schema.title;

    tableHead.innerHTML = '';
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;"><div class="spinner" style="margin:0 auto;"></div></td></tr>`;

    const trHead = document.createElement('tr');
    trHead.innerHTML = `<th>ID</th>`;

    const previewFields = schema.fields.filter(f => f.name !== schema.idField);
    previewFields.forEach(f => {
        trHead.innerHTML += `<th>${f.label}</th>`;
    });
    trHead.innerHTML += `<th>Blockchain Operation</th>`;
    tableHead.appendChild(trHead);

    try {
        const response = await fetch(`${API_BASE_URL}/records/${tableName}`);
        const result = await response.json();

        if (result.success) {
            tableBody.innerHTML = '';

            if (result.data.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="${previewFields.length + 2}" style="text-align: center; color: var(--text-muted);">No records found in this table.</td></tr>`;
                return;
            }

            result.data.forEach(record => {
                const content = record.content;
                const tr = document.createElement('tr');

                let tdHtml = `<td><strong>${record.id}</strong></td>`;

                previewFields.forEach(f => {
                    let val = content[f.name];
                    if (val === null || val === undefined) val = '-';
                    tdHtml += `<td>${val}</td>`;
                });

                tdHtml += `
                    <td>
                        <button class="btn-verify-small" onclick="verifyRecord('${tableName}', '${record.id}')">
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" style="vertical-align: middle; margin-right: 4px;"><path stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            Verify
                        </button>
                    </td>
                `;

                tr.innerHTML = tdHtml;
                tableBody.appendChild(tr);
            });
        }
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="${previewFields.length + 2}" style="text-align: center; color: var(--danger);">Error loading data.</td></tr>`;
    }
}

refreshBtn.addEventListener('click', () => loadTableData(currentVerifyTable));

async function verifyRecord(tableName, recordId) {
    verifyModal.classList.remove('hidden');
    modalResult.classList.add('hidden');
    modalLoader.classList.remove('hidden');

    try {
        const response = await fetch(`${API_BASE_URL}/verify/${tableName}/${recordId}`);
        const result = await response.json();

        modalLoader.classList.add('hidden');
        modalResult.classList.remove('hidden');

        statusMessage.textContent = result.message;

        if (result.success) {
            statusBanner.className = 'status-banner secure';
            statusIcon.innerHTML = '🛡️';
            dbHashText.textContent = result.dbHash;
            chainHashText.textContent = result.chainHash;
            txHashText.textContent = result.verifiedTxHash;
        } else {
            statusBanner.className = 'status-banner danger';
            statusIcon.innerHTML = '⚠️';
            dbHashText.textContent = result.dbHash || 'Not found';
            chainHashText.textContent = result.chainHash || 'Not found';
            txHashText.textContent = result.fakeTxHash || 'Invaild';
        }
    } catch (error) {
        modalLoader.classList.add('hidden');
        modalResult.classList.remove('hidden');
        statusBanner.className = 'status-banner danger';
        statusIcon.innerHTML = '❌';
        statusMessage.textContent = 'Connection error.';
    }
}

closeModal.addEventListener('click', () => {
    verifyModal.classList.add('hidden');
});

verifyModal.addEventListener('click', (e) => {
    if (e.target === verifyModal) {
        verifyModal.classList.add('hidden');
    }
});
