-- =============================================================================
-- ESQUEMA RELACIONAL: AUDITORÍA Y LIBRO MAYOR CONTABLE (POSTGRESQL ACID)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 0. Tipo Enumerado para Estados de Factura (Integridad y Ahorro de Memoria)
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
        CREATE TYPE invoice_status AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Tabla de Registro Maestro de Facturas (Invoices Ledger)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id VARCHAR(64) UNIQUE NOT NULL,
    customer_tax_id VARCHAR(20) NOT NULL,
    subtotal_amount NUMERIC(15, 2) NOT NULL CHECK (subtotal_amount >= 0),
    tax_amount NUMERIC(15, 2) NOT NULL CHECK (tax_amount >= 0),
    total_amount NUMERIC(15, 2) NOT NULL CHECK (total_amount >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status invoice_status NOT NULL DEFAULT 'ISSUED',
    issued_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. Tabla de Asientos Contables (Journal Entries / Partida Doble)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id VARCHAR(64) NOT NULL REFERENCES invoices_ledger(invoice_id) ON DELETE RESTRICT,
    account_code VARCHAR(20) NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    debit_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (debit_amount >= 0),
    credit_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (credit_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT check_nonzero_entry CHECK (debit_amount > 0 OR credit_amount > 0)
);

-- -----------------------------------------------------------------------------
-- 3. Índices Compuestos para Alto Rendimiento (Prevención de Seq Scans)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_invoices_customer_date 
ON invoices_ledger (customer_tax_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_invoice_account 
ON journal_entries (invoice_id, account_code);

-- -----------------------------------------------------------------------------
-- 4. Vista de Auditoría: Detección Instantánea de Asientos Descuadrados
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_unbalanced_invoices AS
SELECT 
    i.invoice_id,
    i.total_amount,
    COALESCE(SUM(j.debit_amount), 0) AS total_debit,
    COALESCE(SUM(j.credit_amount), 0) AS total_credit,
    ABS(COALESCE(SUM(j.debit_amount), 0) - COALESCE(SUM(j.credit_amount), 0)) AS discrepancy
FROM invoices_ledger i
LEFT JOIN journal_entries j ON i.invoice_id = j.invoice_id
GROUP BY i.invoice_id, i.total_amount
HAVING COALESCE(SUM(j.debit_amount), 0) != COALESCE(SUM(j.credit_amount), 0);