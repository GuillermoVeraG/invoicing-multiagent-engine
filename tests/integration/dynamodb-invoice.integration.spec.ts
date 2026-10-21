import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import { DynamoDbInvoiceRepository } from "../../src/infrastructure/adapters/dynamodb-invoice.repository.js";
import { Invoice } from "../../src/domain/entities/invoice.entity.js";
import { TaxId } from "../../src/domain/value-objects/tax-id.vo.js";
import { Money } from "../../src/domain/value-objects/money.vo.js";
import { ExemptVatCalculator } from "../../src/domain/strategies/exempt-vat.calculator.js";

describe("DynamoDbInvoiceRepository", () => {
  const localstackEndpoint =
    process.env.LOCALSTACK_ENDPOINT ?? "http://localhost:4566";
  const tableName = "invoices-integration-test";

  let ddbClient: DynamoDBClient;
  let repository: DynamoDbInvoiceRepository;
  let isLocalStackRunning = false;

  beforeAll(async () => {
    ddbClient = new DynamoDBClient({
      endpoint: localstackEndpoint,
      region: "us-east-1",
      credentials: {
        accessKeyId: "test",
        secretAccessKey: "test",
      },
    });

    // 1. Healthcheck: Verificar si LocalStack está corriendo en el puerto 4566
    try {
      await ddbClient.send(new ListTablesCommand({}));
      isLocalStackRunning = true;
    } catch {
      console.warn(
        `[Integration] LocalStack no detectado en "${localstackEndpoint}". Pruebas de integración omitidas.`,
      );
      return;
    }

    // 2. Crear tabla efímera real en LocalStack con el esquema Single-Table
    await ddbClient.send(
      new CreateTableCommand({
        TableName: tableName,
        KeySchema: [
          { AttributeName: "PK", KeyType: "HASH" },
          { AttributeName: "SK", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "PK", AttributeType: "S" },
          { AttributeName: "SK", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    repository = new DynamoDbInvoiceRepository({
      tableName,
      client: ddbClient,
    });
  });

  afterAll(async () => {
    // 3. Limpieza: Eliminar tabla efímera al finalizar
    if (isLocalStackRunning) {
      try {
        await ddbClient.send(new DeleteTableCommand({ TableName: tableName }));
      } catch {
        // Ignorar si ya fue eliminada
      }
    }
  });

  it("debe persistir y recuperar una factura real en DynamoDB", async () => {
    if (!isLocalStackRunning) {
      console.log("-> Test omitido: Requiere 'docker compose up -d'");
      return;
    }

    // Crear factura de dominio real
    const taxId = TaxId.create("TAX-900123456");
    const money = Money.create(350);
    if (!taxId.success || !money.success) throw new Error("Setup error");

    const invoiceResult = Invoice.create({
      id: "INV-LOCALSTACK-001",
      customerTaxId: taxId.value,
      items: [{ sku: "SKU-SERVERLESS", quantity: 1, unitPrice: money.value }],
      taxCalculator: new ExemptVatCalculator(),
    });

    if (!invoiceResult.success) throw new Error("Setup error");
    const domainInvoice = invoiceResult.value;

    // 1. Ejecutar persistencia real en DynamoDB
    await repository.save(domainInvoice);

    // 2. Leer directamente de la base de datos real
    const retrievedInvoice = await repository.findById("INV-LOCALSTACK-001");

    // 3. Aserciones de integración
    expect(retrievedInvoice).not.toBeNull();
    if (retrievedInvoice) {
      expect(retrievedInvoice.id).toBe("INV-LOCALSTACK-001");
      expect(retrievedInvoice.customerTaxId.value).toBe("TAX-900123456");
      expect(retrievedInvoice.total.amount).toBe(350);
      expect(retrievedInvoice.status).toBe("ISSUED");
      expect(retrievedInvoice.items).toHaveLength(1);
      expect(retrievedInvoice.items[0]?.sku).toBe("SKU-SERVERLESS");
    }
  });
});
