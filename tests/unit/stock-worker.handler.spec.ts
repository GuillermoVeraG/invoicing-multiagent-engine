import { describe, it, expect } from "vitest";
import { SQSEvent, SQSRecord } from "aws-lambda";
import { handler } from "../../src/infrastructure/lambdas/stock-worker.handler.js";

describe("StockWorker Lambda", () => {
  // Función auxiliar para emular un registro real de SQS conteniendo un sobre SNS
  const buildSqsRecord = (options: {
    readonly messageId: string;
    readonly eventName: string;
    readonly invoiceId: string;
  }): SQSRecord => {
    const snsEnvelope = {
      Type: "Notification",
      MessageId: `sns-${options.messageId}`,
      Message: JSON.stringify({
        eventName: options.eventName,
        occurredOn: new Date().toISOString(),
        payload: {
          invoiceId: options.invoiceId,
          customerTaxId: "TAX-900123456",
          total: 100,
        },
      }),
    };

    return {
      messageId: options.messageId,
      receiptHandle: `receipt-${options.messageId}`,
      body: JSON.stringify(snsEnvelope),
      attributes: {} as any,
      messageAttributes: {},
      md5OfBody: "dummy-md5",
      eventSource: "aws:sqs",
      eventSourceARN:
        "arn:aws:sqs:us-east-1:123456789012:stock-update-queue-dev",
      awsRegion: "us-east-1",
    };
  };

  it("debe procesar exitosamente un lote completo y retornar batchItemFailures vacío", async () => {
    const sqsEvent: SQSEvent = {
      Records: [
        buildSqsRecord({
          messageId: "msg-101",
          eventName: "invoice.issued",
          invoiceId: "INV-101",
        }),
        buildSqsRecord({
          messageId: "msg-102",
          eventName: "invoice.issued",
          invoiceId: "INV-102",
        }),
      ],
    };

    const response = await handler(sqsEvent);

    expect(response.batchItemFailures).toEqual([]);
  });

  it("debe aislar mensajes fallidos y retornar ÚNICAMENTE el identificador del mensaje con error", async () => {
    const sqsEvent: SQSEvent = {
      Records: [
        buildSqsRecord({
          messageId: "msg-SUCCESS-1",
          eventName: "invoice.issued",
          invoiceId: "INV-OK-1",
        }),
        // Mensaje con fallo simulado
        buildSqsRecord({
          messageId: "msg-FAILED-2",
          eventName: "invoice.issued",
          invoiceId: "FORCE_POISON_PILL_TEST",
        }),
        buildSqsRecord({
          messageId: "msg-SUCCESS-3",
          eventName: "invoice.issued",
          invoiceId: "INV-OK-3",
        }),
      ],
    };

    const response = await handler(sqsEvent);

    expect(response.batchItemFailures).toEqual([
      { itemIdentifier: "msg-FAILED-2" },
    ]);
  });

  it("debe ignorar eventos que no sean 'invoice.issued' sin fallar", async () => {
    const sqsEvent: SQSEvent = {
      Records: [
        buildSqsRecord({
          messageId: "msg-IGNORE-1",
          eventName: "invoice.cancelled",
          invoiceId: "INV-CANCEL",
        }),
      ],
    };

    const response = await handler(sqsEvent);

    expect(response.batchItemFailures).toEqual([]);
  });
});
