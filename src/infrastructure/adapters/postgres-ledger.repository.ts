import pg from "pg";
const { Pool } = pg;
import { Invoice } from "../../domain/entities/invoice.entity.js";
import {
  DatabaseConnectionError,
  DatabasePersistenceError,
} from "../errors/infrastructure-error.js";

export interface UnbalancedInvoiceDiscrepancy {
  readonly invoiceId: string;
  readonly totalAmount: number;
  readonly totalDebit: number;
  readonly totalCredit: number;
  readonly discrepancy: number;
}

export interface LedgerEntryDetail {
  readonly invoiceId: string;
  readonly customerTaxId: string;
  readonly totalAmount: number;
  readonly status: string;
  readonly entries: ReadonlyArray<{
    readonly accountCode: string;
    readonly accountName: string;
    readonly debitAmount: number;
    readonly creditAmount: number;
  }>;
}

export class PostgresLedgerRepository {
  private readonly pool: pg.Pool;

  constructor(options?: {
    readonly pool?: pg.Pool;
    readonly connectionString?: string;
  }) {
    this.pool =
      options?.pool ??
      new Pool({
        connectionString:
          options?.connectionString ??
          process.env.DATABASE_URL ??
          "postgresql://postgres:postgres@localhost:5432/invoicing_ledger",
        max: 10, // Control del pool para evitar saturar conexiones
        idleTimeoutMillis: 30000,
      });
  }

  /**
   * Registra una factura y sus asientos de partida doble dentro de una transacción ACID.
   */
  public async recordInvoice(invoice: Invoice): Promise<void> {
    let client: pg.PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw new DatabaseConnectionError("PostgreSQL Invoicing Ledger", error);
    }

    try {
      await client.query("BEGIN");

      const insertLedgerQuery = `
        INSERT INTO invoices_ledger (
          invoice_id, customer_tax_id, subtotal_amount, tax_amount, total_amount, currency, status, issued_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (invoice_id) DO UPDATE SET
          status = EXCLUDED.status;
      `;

      await client.query(insertLedgerQuery, [
        invoice.id,
        invoice.customerTaxId.value,
        invoice.subtotal.amount,
        invoice.tax.amount,
        invoice.total.amount,
        invoice.total.currency,
        invoice.status,
        invoice.createdAt,
      ]);

      const insertEntryQuery = `
        INSERT INTO journal_entries (
          invoice_id, account_code, account_name, debit_amount, credit_amount
        ) VALUES ($1, $2, $3, $4, $5);
      `;

      // Débito a Clientes (1305) por el total
      await client.query(insertEntryQuery, [
        invoice.id,
        "1305",
        "Cuentas por Cobrar Clientes",
        invoice.total.amount,
        0.0,
      ]);

      // Crédito a Ingresos Operacionales (4135) por el subtotal
      await client.query(insertEntryQuery, [
        invoice.id,
        "4135",
        "Ingresos por Ventas",
        0.0,
        invoice.subtotal.amount,
      ]);

      // Crédito a IVA por Pagar (2408) solo si hubo impuesto > 0
      if (invoice.tax.amount > 0) {
        await client.query(insertEntryQuery, [
          invoice.id,
          "2408",
          "Impuesto sobre las Ventas por Pagar (IVA)",
          0.0,
          invoice.tax.amount,
        ]);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw new DatabasePersistenceError(
        `Registrar factura ${invoice.id} y partida doble en PostgreSQL`,
        error,
      );
    } finally {
      client.release();
    }
  }

  /**
   * Consulta optimizada que previene el problema de N+1 Queries mediante agregación JSON.
   */
  public async getInvoiceLedger(
    invoiceId: string,
  ): Promise<LedgerEntryDetail | null> {
    const query = `
      SELECT 
        i.invoice_id AS "invoiceId",
        i.customer_tax_id AS "customerTaxId",
        i.total_amount AS "totalAmount",
        i.status,
        COALESCE(
          json_agg(
            json_build_object(
              'accountCode', j.account_code,
              'accountName', j.account_name,
              'debitAmount', j.debit_amount,
              'creditAmount', j.credit_amount
            )
          ) FILTER (WHERE j.id IS NOT NULL),
          '[]'
        ) AS entries
      FROM invoices_ledger i
      LEFT JOIN journal_entries j ON i.invoice_id = j.invoice_id
      WHERE i.invoice_id = $1
      GROUP BY i.invoice_id, i.customer_tax_id, i.total_amount, i.status;
    `;

    try {
      const result = await this.pool.query(query, [invoiceId]);
      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as LedgerEntryDetail;
    } catch (error) {
      throw new DatabasePersistenceError(
        `Consultar factura ${invoiceId} y partida doble en PostgreSQL`,
        error,
      );
    }
  }

  /**
   * Método de auditoría: Consulta facturas con discrepancias contables.
   * Consumido por el Agente IA de LangGraph / Servidor MCP.
   */
  public async findUnbalancedInvoices(): Promise<
    Array<UnbalancedInvoiceDiscrepancy>
  > {
    const query = `
      SELECT 
        invoice_id AS "invoiceId",
        total_amount AS "totalAmount",
        total_debit AS "totalDebit",
        total_credit AS "totalCredit",
        discrepancy
      FROM v_unbalanced_invoices
      WHERE discrepancy > 0; 
    `;

    try {
      const result = await this.pool.query(query);
      return result.rows as Array<UnbalancedInvoiceDiscrepancy>;
    } catch (error) {
      throw new DatabasePersistenceError(
        `Consultar facturas con discrepancias contables en PostgreSQL`,
        error,
      );
    }
  }

  /**
   * Cierra el pool de conexiones.
   */
  public async close(): Promise<void> {
    await this.pool.end();
  }
}
