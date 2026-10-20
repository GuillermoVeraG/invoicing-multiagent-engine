import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
} from "../../domain/entities/invoice.entity.js";
import { IInvoiceRepository } from "../../domain/ports/invoice-repository.port.js";
import { Money } from "../../domain/value-objects/money.vo.js";
import { TaxId } from "../../domain/value-objects/tax-id.vo.js";

/**
 * Esquema persistido en la tabla DynamoDB (Single-Table Design).
 */
interface DynamoDbInvoiceItem {
  readonly PK: string; // INVOICE#<id>
  readonly SK: string; // METADATA
  readonly GSI1PK: string; // TAX#<customerTaxId>
  readonly GSI1SK: string; // DATE#<isoString>
  readonly id: string;
  readonly customerTaxId: string;
  readonly items: ReadonlyArray<{
    readonly sku: string;
    readonly quantity: number;
    readonly unitPrice: { readonly amount: number; readonly currency: string };
  }>;
  readonly subtotal: { readonly amount: number; readonly currency: string };
  readonly tax: { readonly amount: number; readonly currency: string };
  readonly total: { readonly amount: number; readonly currency: string };
  readonly status: InvoiceStatus;
  readonly createdAt: string;
}

export class DynamoDbInvoiceRepository implements IInvoiceRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(options: {
    readonly tableName: string;
    readonly client?: DynamoDBClient;
  }) {
    this.tableName = options.tableName;

    // Si no se inyecta un cliente, creamos uno estándar (facilita testing con LocalStack)
    const baseClient = options.client ?? new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(baseClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }

  /**
   * Persiste una entidad Invoice en la tabla DynamoDB.
   */
  public async save(invoice: Invoice): Promise<void> {
    const item: DynamoDbInvoiceItem = {
      PK: `INVOICE#${invoice.id}`,
      SK: "METADATA",
      GSI1PK: `TAX#${invoice.customerTaxId.value}`,
      GSI1SK: `DATE#${invoice.createdAt.toISOString()}`,
      id: invoice.id,
      customerTaxId: invoice.customerTaxId.value,
      items: invoice.items.map((i) => ({
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: {
          amount: i.unitPrice.amount,
          currency: i.unitPrice.currency,
        },
      })),
      subtotal: {
        amount: invoice.subtotal.amount,
        currency: invoice.subtotal.currency,
      },
      tax: {
        amount: invoice.tax.amount,
        currency: invoice.tax.currency,
      },
      total: {
        amount: invoice.total.amount,
        currency: invoice.total.currency,
      },
      status: invoice.status,
      createdAt: invoice.createdAt.toISOString(),
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      }),
    );
  }

  /**
   * Recupera una factura por su ID y la reconstituye en una entidad de dominio rica.
   */
  public async findById(id: string): Promise<Invoice | null> {
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `INVOICE#${id}`,
          SK: "METADATA",
        },
      }),
    );

    if (!response.Item) {
      return null;
    }

    const raw = response.Item as DynamoDbInvoiceItem;

    // 1. Rehidratar Value Objects con validación
    const taxIdResult = TaxId.create(raw.customerTaxId);
    if (!taxIdResult.success) {
      throw new Error(
        `Datos corruptos en DynamoDB para TaxId: ${raw.customerTaxId}`,
      );
    }

    const subtotalResult = Money.create(
      raw.subtotal.amount,
      raw.subtotal.currency,
    );
    const taxResult = Money.create(raw.tax.amount, raw.tax.currency);
    const totalResult = Money.create(raw.total.amount, raw.total.currency);

    if (!subtotalResult.success || !taxResult.success || !totalResult.success) {
      throw new Error(
        `Datos corruptos de montos en DynamoDB para factura: ${raw.id}`,
      );
    }

    // 2. Rehidratar ítems
    const domainItems: InvoiceItem[] = [];
    for (const item of raw.items) {
      const priceResult = Money.create(
        item.unitPrice.amount,
        item.unitPrice.currency,
      );
      if (!priceResult.success) {
        throw new Error(`Precio corrupto en DynamoDB para SKU: ${item.sku}`);
      }
      domainItems.push({
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: priceResult.value,
      });
    }

    // 3. Reconstituir la entidad pura sin alterar su fecha original ni estado
    return Invoice.reconstitute({
      id: raw.id,
      customerTaxId: taxIdResult.value,
      items: domainItems,
      subtotal: subtotalResult.value,
      tax: taxResult.value,
      total: totalResult.value,
      status: raw.status,
      createdAt: new Date(raw.createdAt),
    });
  }
}
