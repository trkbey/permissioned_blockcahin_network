const { ValidationError } = require('./errors');

/**
 * Tek bir degeri kolon tanimina gore dogrular ve Postgres'e gonderilecek
 * bicime cevirir.
 *
 * Frontend form alanlarini string olarak gonderdigi icin "12" gibi degerler
 * sayiya cevrilir; ama "abc" sessizce NaN'a dusurulmez, hata verilir.
 *
 * @returns {{ value: any } | { error: string }}
 */
function coerce(value, spec) {
    if (typeof value === 'string') value = value.trim();

    if (value === '' || value === null || value === undefined) {
        return { error: 'must not be empty' };
    }

    switch (spec.type) {
        case 'int': {
            if (typeof value === 'number') {
                if (!Number.isInteger(value)) return { error: 'must be a whole number' };
            } else if (!/^-?\d+$/.test(String(value))) {
                return { error: 'must be a whole number' };
            }
            const n = Number(value);
            if (!Number.isSafeInteger(n)) return { error: 'is out of the supported range' };
            if (spec.min !== undefined && n < spec.min) return { error: `must be at least ${spec.min}` };
            if (spec.max !== undefined && n > spec.max) return { error: `must be at most ${spec.max}` };
            return { value: n };
        }

        case 'numeric': {
            if (!/^-?\d+(\.\d+)?$/.test(String(value))) return { error: 'must be a number' };
            const n = Number(value);
            if (!Number.isFinite(n)) return { error: 'must be a number' };
            if (spec.min !== undefined && n < spec.min) return { error: `must be at least ${spec.min}` };
            if (spec.max !== undefined && n > spec.max) return { error: `must be at most ${spec.max}` };
            // Postgres'e string olarak gonderilir; ondalik hassasiyeti
            // JS float'a ugramadan numeric tipe gecer.
            return { value: String(value) };
        }

        case 'text': {
            const s = String(value);
            if (spec.maxLength && s.length > spec.maxLength) {
                return { error: `must be at most ${spec.maxLength} characters` };
            }
            return { value: s };
        }

        default:
            return { error: 'has an unsupported type' };
    }
}

/**
 * POST govdesini tablo semasina gore dogrular.
 *
 * Sirasiyla kontrol eder:
 *   1. Govde bir nesne mi
 *   2. Bilinmeyen/izinsiz kolon var mi  (mass assignment savunmasi)
 *   3. Zorunlu kolonlar eksik mi
 *   4. Her degerin tipi ve siniri uygun mu
 *
 * Tum hatalar TEK SEFERDE toplanir; kullanici formu ard arda gondermek
 * zorunda kalmaz.
 *
 * @returns {{ columns: string[], values: any[] }}
 * @throws  {ValidationError}
 */
function validateRecord(tableName, spec, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ValidationError('Request body must be a JSON object.');
    }

    const allowed = Object.keys(spec.columns);
    const provided = Object.keys(body);
    const details = [];

    if (provided.length === 0) {
        throw new ValidationError('Request body must contain at least one field.');
    }

    for (const key of provided) {
        if (!allowed.includes(key)) {
            details.push({
                field: key,
                message: `is not a writable field on "${tableName}"`,
            });
        }
    }

    for (const [name, colSpec] of Object.entries(spec.columns)) {
        const present = Object.prototype.hasOwnProperty.call(body, name);
        if (colSpec.required && (!present || body[name] === '' || body[name] === null)) {
            details.push({ field: name, message: 'is required' });
        }
    }

    const columns = [];
    const values = [];

    for (const [name, colSpec] of Object.entries(spec.columns)) {
        if (!Object.prototype.hasOwnProperty.call(body, name)) continue;

        const raw = body[name];
        // Zorunlu olmayan alanin bos gelmesi "gonderilmedi" sayilir,
        // boylece DEFAULT degeri devreye girer.
        if (!colSpec.required && (raw === '' || raw === null || raw === undefined)) continue;

        const result = coerce(raw, colSpec);
        if (result.error) {
            details.push({ field: name, message: result.error });
            continue;
        }
        columns.push(name);
        values.push(result.value);
    }

    if (details.length > 0) {
        throw new ValidationError('One or more fields are invalid.', details);
    }

    if (columns.length === 0) {
        throw new ValidationError('Request body must contain at least one writable field.');
    }

    return { columns, values };
}

module.exports = { validateRecord, coerce };
