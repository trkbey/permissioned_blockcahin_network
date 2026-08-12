CREATE TABLE tables (
    "table_id" INTEGER PRIMARY KEY,
    "table_name" VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO tables ("table_id", "table_name") VALUES 
(1, 'date'),
(2, 'product'),
(3, 'machine'),
(4, 'shift'),
(5, 'employee'),
(6, 'factory'),
(7, 'production');

CREATE TABLE date (
    date_id  INTEGER PRIMARY KEY,
    full_date  DATE NOT NULL ,
    day  INTEGER NOT NULL,
    month  INTEGER NOT NULL,
    month_name VARCHAR(20) NOT NULL,
    quarter INTEGER NOT NULL,
    year INTEGER NOT NULL,
    week INTEGER NOT NULL,
    day_of_week VARCHAR(20) NOT NULL
);

create table product (
    product_id integer primary key,
    product_code varchar(20) unique not null,
    product_name varchar(300) not null,
    category varchar(100) not null,
    model varchar(100) not null,
    unit varchar(20) not null
);

create table machine (
    machine_id integer primary key,
    machine_code varchar(50) unique not null,
    machine_name varchar(200) not null,
    machine_type varchar(50),
    manufacturer varchar(150),
    model varchar(50),
    installaction_date date
);

create table shift (
    shift_id integer primary key,
    shift_name  varchar(50) not null,
    start_time time not null,
    end_time time not null
);

create table employee (
    employee_id integer primary key,
    employee_code varchar(20) unique not null,
    employee_name varchar(50) not null,
    department varchar(200) not null,
    job_position varchar(100),
    team varchar(100)
);

create table factory (
    factory_id integer primary key,
    factory_name varchar(100) not null,
    city varchar(100),
    country varchar(100),
    production_area varchar(100)
);

create table production (
    production_id bigserial primary key,

    date_id integer not null,
    machine_id integer not null,
    shift_id integer not null,
    employee_id integer not null,
    factory_id integer not null,
    product_id integer not null,

    quantity integer not null,
    defective_quantity integer not null default 0,
    production_time_minutes integer  not null,
    downtime_minutes integer not null default 0,
    production_cost decimal(12, 2) not null,

    constraint fk_production_date foreign key (date_id) references date(date_id),
    constraint fk_production_machine foreign key (machine_id) references machine(machine_id),
    constraint fk_production_product foreign key (product_id) references product(product_id),
    constraint fk_production_shift foreign key (shift_id) references shift(shift_id),
    constraint fk_production_employee foreign key (employee_id) references employee(employee_id),
    constraint fk_production_factory foreign key (factory_id) references factory(factory_id)
);

CREATE TABLE "hash_anchors" (
    "id" TEXT NOT NULL,
    "table_id" INTEGER NOT NULL,
    "record_id" TEXT NOT NULL,
    "record_hash" TEXT NOT NULL,
    "tx_hash" TEXT,
    "block_number" BIGINT,
    "anchored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "hash_anchors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_hash_anchors_table" FOREIGN KEY ("table_id") REFERENCES "tables"("table_id")
);

CREATE TABLE "verification_log" (
    "id" TEXT NOT NULL,
    "table_id" INTEGER NOT NULL,
    "record_id" TEXT NOT NULL,
    "computed_hash" TEXT NOT NULL,
    "chain_hash" TEXT NOT NULL,
    "is_valid" BOOLEAN NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_verification_log_table" FOREIGN KEY ("table_id") REFERENCES "tables"("table_id")
);

CREATE INDEX "hash_anchors_record_id_idx" ON "hash_anchors"("table_id", "record_id");
CREATE INDEX "verification_log_record_id_idx" ON "verification_log"("table_id", "record_id");

CREATE OR REPLACE FUNCTION notify_new_record()
RETURNS TRIGGER AS $$
DECLARE
  v_table_id INTEGER;
  v_record_id TEXT;
BEGIN
 
  SELECT table_id INTO v_table_id FROM tables WHERE table_name = TG_TABLE_NAME;
  
  IF TG_TABLE_NAME = 'date' THEN v_record_id := NEW.date_id::TEXT;
  ELSIF TG_TABLE_NAME = 'product' THEN v_record_id := NEW.product_id::TEXT;
  ELSIF TG_TABLE_NAME = 'machine' THEN v_record_id := NEW.machine_id::TEXT;
  ELSIF TG_TABLE_NAME = 'shift' THEN v_record_id := NEW.shift_id::TEXT;
  ELSIF TG_TABLE_NAME = 'employee' THEN v_record_id := NEW.employee_id::TEXT;
  ELSIF TG_TABLE_NAME = 'factory' THEN v_record_id := NEW.factory_id::TEXT;
  ELSIF TG_TABLE_NAME = 'production' THEN v_record_id := NEW.production_id::TEXT;
  END IF;

  PERFORM pg_notify(
    'new_critical_record',
    json_build_object(
      'table_id', v_table_id,
      'table_name', TG_TABLE_NAME,
      'record_id', v_record_id,
      'content', row_to_json(NEW)
    )::text
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_date AFTER INSERT ON date FOR EACH ROW EXECUTE FUNCTION notify_new_record();
CREATE TRIGGER trigger_notify_product AFTER INSERT ON product FOR EACH ROW EXECUTE FUNCTION notify_new_record();
CREATE TRIGGER trigger_notify_machine AFTER INSERT ON machine FOR EACH ROW EXECUTE FUNCTION notify_new_record();
CREATE TRIGGER trigger_notify_shift AFTER INSERT ON shift FOR EACH ROW EXECUTE FUNCTION notify_new_record();
CREATE TRIGGER trigger_notify_employee AFTER INSERT ON employee FOR EACH ROW EXECUTE FUNCTION notify_new_record();
CREATE TRIGGER trigger_notify_factory AFTER INSERT ON factory FOR EACH ROW EXECUTE FUNCTION notify_new_record();
CREATE TRIGGER trigger_notify_production AFTER INSERT ON production FOR EACH ROW EXECUTE FUNCTION notify_new_record();

insert into date (
    date_id, full_date, day, month, month_name, quarter, year, week, day_of_week
)
values (20260810, '2026-08-10', 10, 8, 'August', 3, 2026, 33, 'Monday'),
(20260811, '2026-08-11', 11, 8, 'August', 3, 2026, 33, 'Tuesday'),
(20260812, '2026-08-12', 12, 8, 'August', 3, 2026, 33, 'Wednesday'),
(20260813, '2026-08-13', 13, 8, 'August', 3, 2026, 33, 'Thursday'),
(20260814, '2026-08-14', 14, 8, 'August', 3, 2026, 33, 'Friday');

INSERT INTO product (
    product_id, product_code, product_name, category, model, unit
)
VALUES
(1, 'MTR-001', 'Electric Motor A', 'Motor', 'EM-A100', 'piece'),
(2, 'MTR-002', 'Electric Motor B', 'Motor', 'EM-B200', 'piece'),
(3, 'PMP-001', 'Industrial Pump A', 'Pump', 'IP-A100', 'piece'),
(4, 'PMP-002', 'Industrial Pump B', 'Pump', 'IP-B200', 'piece'),
(5, 'GEN-001', 'Generator A', 'Generator', 'GN-A100', 'piece');

insert into machine(
    machine_id, machine_code, machine_name, machine_type, manufacturer, model, installaction_date
)
values 
(1, 'CNC-001', 'CNC Machine 1', 'CNC', 'Siemens', 'CNC-X100', '2023-05-15'),
(2, 'CNC-002', 'CNC Machine 2', 'CNC', 'Siemens', 'CNC-X200', '2023-08-20'),
(3, 'ASM-001', 'Assembly Line 1', 'Assembly', 'Bosch', 'ASM-A100', '2022-03-10'),
(4, 'ASM-002', 'Assembly Line 2', 'Assembly', 'Bosch', 'ASM-A200', '2022-09-05'),
(5, 'WLD-001', 'Welding Machine 1', 'Welding', 'Lincoln', 'WLD-500', '2024-01-12');

INSERT INTO shift (
    shift_id, shift_name, start_time, end_time
)
VALUES
(1, 'Morning', '08:00:00', '16:00:00'),
(2, 'Evening', '16:00:00', '00:00:00'),
(3, 'Night', '00:00:00', '08:00:00');

INSERT INTO employee (
    employee_id, employee_code, employee_name, department, job_position, team
)
VALUES
(1, 'EMP-001', 'Ahmet Yilmaz', 'Production', 'Operator', 'Team A'),
(2, 'EMP-002', 'Mehmet Kaya', 'Production', 'Operator', 'Team A'),
(3, 'EMP-003', 'Ayse Demir', 'Production', 'Operator', 'Team B'),
(4, 'EMP-004', 'Fatma Celik', 'Production', 'Supervisor', 'Team B'),
(5, 'EMP-005', 'Ali Kurt', 'Production', 'Operator', 'Team C');

INSERT INTO factory (
    factory_id, factory_name, city, country, production_area
)
VALUES
(1, 'Factory Konya', 'Konya', 'Turkey', 'Motor Production'),
(2, 'Factory Ankara', 'Ankara', 'Turkey', 'Pump Production'),
(3, 'Factory Istanbul', 'Istanbul', 'Turkey', 'Generator Production');

INSERT INTO production (
    date_id, product_id, machine_id, shift_id, employee_id, factory_id, 
    quantity, defective_quantity, production_time_minutes, downtime_minutes, production_cost
)
VALUES

(20260810, 1, 1, 1, 1, 1, 1000, 20, 450, 30, 12500.00),
(20260810, 2, 2, 1, 2, 1, 800, 12, 430, 50, 11200.00),
(20260810, 3, 3, 2, 3, 2, 600, 8, 400, 40, 9500.00),

(20260811, 1, 1, 1, 1, 1, 1200, 15, 460, 20, 14500.00),
(20260811, 2, 2, 2, 2, 1, 950, 18, 440, 35, 13100.00),
(20260811, 3, 3, 2, 3, 2, 720, 10, 410, 30, 10500.00),
(20260811, 4, 4, 3, 4, 2, 500, 5, 390, 60, 8200.00),

(20260812, 1, 1, 1, 1, 1, 1100, 10, 455, 25, 13500.00),
(20260812, 3, 3, 2, 3, 2, 800, 6, 420, 20, 11800.00),
(20260812, 5, 5, 3, 5, 3, 300, 3, 380, 70, 7200.00),

(20260813, 2, 2, 1, 2, 1, 1050, 14, 445, 25, 13900.00),
(20260813, 4, 4, 2, 4, 2, 650, 7, 400, 40, 9700.00),
(20260813, 5, 5, 3, 5, 3, 350, 4, 370, 80, 8100.00),

(20260814, 1, 1, 1, 1, 1, 1300, 11, 465, 15, 15200.00),
(20260814, 2, 2, 2, 2, 1, 1000, 9, 450, 20, 13700.00),
(20260814, 3, 3, 2, 3, 2, 850, 5, 430, 15, 12200.00);

CREATE OR REPLACE FUNCTION add_daily_date()
RETURNS void AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_date_id INTEGER;
    v_day INTEGER;
    v_month INTEGER;
    v_month_name VARCHAR(20);
    v_quarter INTEGER;
    v_year INTEGER;
    v_week INTEGER;
    v_day_of_week VARCHAR(20);
BEGIN
    v_date_id := to_char(v_today, 'YYYYMMDD')::INTEGER;
    
    IF NOT EXISTS (SELECT 1 FROM date WHERE date_id = v_date_id) THEN
        v_day := extract(day from v_today);
        v_month := extract(month from v_today);
        v_month_name := trim(to_char(v_today, 'Month'));
        v_quarter := extract(quarter from v_today);
        v_year := extract(year from v_today);
        v_week := extract(week from v_today);
        v_day_of_week := trim(to_char(v_today, 'Day'));
        
        INSERT INTO date (date_id, full_date, day, month, month_name, quarter, year, week, day_of_week)
        VALUES (v_date_id, v_today, v_day, v_month, v_month_name, v_quarter, v_year, v_week, v_day_of_week);
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('insert_daily_date_job', '0 0 * * *', 'SELECT add_daily_date()');