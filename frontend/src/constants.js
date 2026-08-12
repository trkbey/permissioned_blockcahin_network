export const API_BASE_URL = 'http://localhost:3000/api';

export const TABLE_SCHEMAS = {
    date: {
        title: "Date",
        idField: "date_id",
        fields: [
            { name: "date_id", label: "Date ID (YYYYMMDD)", type: "number" },
            { name: "full_date", label: "Full date", type: "date" },
            { name: "day", label: "Day", type: "number" },
            { name: "month", label: "Month numeric", type: "number" },
            { name: "month_name", label: "Month name", type: "text" },
            { name: "quarter", label: "Quarter", type: "number" },
            { name: "year", label: "Year", type: "number" },
            { name: "week", label: "Week", type: "number" },
            { name: "day_of_week", label: "Day of week", type: "text" }
        ]
    },
    product: {
        title: "Product",
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
        title: "Machine",
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
        title: "Shift",
        idField: "shift_id",
        fields: [
            { name: "shift_id", label: "Id", type: "number" },
            { name: "shift_name", label: "Name", type: "text" },
            { name: "start_time", label: "Start Time", type: "time", step: "1" },
            { name: "end_time", label: "End Time", type: "time", step: "1" }
        ]
    },
    employee: {
        title: "Employee",
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
        title: "Factory",
        idField: "factory_id",
        fields: [
            { name: "factory_id", label: "Factory ID", type: "number" },
            { name: "factory_name", label: "Factory Name", type: "text" },
            { name: "city", label: "City", type: "text" },
            { name: "country", label: "Country", type: "text" },
            { name: "production_area", label: "Production Area", type: "text" }
        ]
    },
    production: {
        title: "Production",
        idField: "production_id",
        fields: [
            { name: "date_id", label: "Date ID", type: "number" },
            { name: "product_id", label: "Product ID", type: "number" },
            { name: "machine_id", label: "Machine ID", type: "number" },
            { name: "shift_id", label: "Shift ID", type: "number" },
            { name: "employee_id", label: "Employee ID", type: "number" },
            { name: "factory_id", label: "Factory ID", type: "number" },
            { name: "quantity", label: "Quantity", type: "number" },
            { name: "defective_quantity", label: "Defective quantity", type: "number" },
            { name: "production_time_minutes", label: "Prod. time (min)", type: "number" },
            { name: "downtime_minutes", label: "Downtime (min)", type: "number" },
            { name: "production_cost", label: "Cost", type: "number", step: "0.01" }
        ]
    }
};

// These are the only tables we verify on blockchain now
export const VERIFIABLE_TABLES = ['date', 'product', 'employee', 'production'];
// These are all tables we can add data to
export const ALL_TABLES = Object.keys(TABLE_SCHEMAS);
