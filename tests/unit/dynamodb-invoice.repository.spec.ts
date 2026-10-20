import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDbInvoiceRepository } from "../../src/infrastructure/adapters/dynamodb-invoice.repository.js";
import { Invoice } from "../../src/domain/entities/invoice.entity.js";
import { TaxId } from "../../src/domain/value-objects/tax-id.vo.js";
import { Money } from "../../src/domain/value-objects/money.vo.js";
import { ExemptVatCalculator } from "../../src/domain/strategies/exempt-vat.calculator.js";

describe("DynamoDbInvoiceRepository", () => {
  const tableName = "invoices-test";
  let repository: DynamoDbInvoiceRepository;
  let mockSend: ReturnType<typeof vi.fn>;

  const createDomainInvoice = (): Invoice => {
    const taxId = TaxId.create("TAX-900123456");
    const money = Money.create(150);
    if (!taxId.success || !money.success) throw new Error("Setup error");

    const result = Invoice.create({
      id: "INV-999",
      customerTaxId: taxId.value,
      items: [{ sku: "SKU-CLOUD", quantity: 1, unitPrice: money.value }],
      taxCalculator: new ExemptVatCalculator(),
    });

    if (!result.success) throw new Error("Setup error");
    return result.value;
  };

  beforeEach(() => {
    mockSend = vi.fn();
    // Inyectamos un mock limpio del DocumentClient para probar sin tocar AWS
    repository = new DynamoDbInvoiceRepository({
      tableName,
    });
    // Sobrescribimos el send interno del cliente
    (repository as any).docClient = {
      send: mockSend,
    };
  });

  it("debe persistir una factura mapeando a las claves Single-Table (PK, SK, GSI1)", async () => {
    mockSend.mockResolvedValueOnce({});
    const invoice = createDomainInvoice();

    await repository.save(invoice);

    expect(mockSend).toHaveBeenCalledOnce();
    const command = mockSend.mock.calls[0][0];

    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input.TableName).toBe(tableName);
    expect(command.input.Item).toMatchObject({
      PK: "INVOICE#INV-999",
      SK: "METADATA",
      GSI1PK: "TAX#TAX-900123456",
      id: "INV-999",
      customerTaxId: "TAX-900123456",
      status: "ISSUED",
      total: { amount: 150, currency: "USD" },
    });
  });

  it("debe recuperar y reconstituir una entidad Invoice existente mediante findById", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        PK: "INVOICE#INV-999",
        SK: "METADATA",
        GSI1PK: "TAX#TAX-900123456",
        GSI1SK: "DATE#2026-10-17T00:00:00.000Z",
        id: "INV-999",
        customerTaxId: "TAX-900123456",
        items: [
          {
            sku: "SKU-CLOUD",
            quantity: 1,
            unitPrice: { amount: 150, currency: "USD" },
          },
        ],
        subtotal: { amount: 150, currency: "USD" },
        tax: { amount: 0, currency: "USD" },
        total: { amount: 150, currency: "USD" },
        status: "ISSUED",
        createdAt: "2026-10-17T00:00:00.000Z",
      },
    });

    const invoice = await repository.findById("INV-999");

    expect(mockSend).toHaveBeenCalledOnce();
    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input.Key).toEqual({
      PK: "INVOICE#INV-999",
      SK: "METADATA",
    });

    expect(invoice).not.toBeNull();
    if (invoice) {
      expect(invoice.id).toBe("INV-999");
      expect(invoice.customerTaxId.value).toBe("TAX-900123456");
      expect(invoice.total.amount).toBe(150);
      expect(invoice.status).toBe("ISSUED");
    }
  });

  it("debe retornar null cuando la factura no existe en DynamoDB", async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const invoice = await repository.findById("NON-EXISTENT");

    expect(mockSend).toHaveBeenCalledOnce();
    expect(invoice).toBeNull();
  });
});
