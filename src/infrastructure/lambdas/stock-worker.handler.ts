import { SQSEvent, SQSBatchResponse, SQSRecord } from "aws-lambda";

export interface StockDeductionPayload {
  readonly invoiceId: string;
  readonly customerTaxId: string;
  readonly total: number;
}

/**
 * Worker Serverless que descuenta existencias de inventario
 * a partir de los eventos 'invoice.issued' distribuidos por Amazon SNS hacia SQS.
 */
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];

  for (const record of event.Records) {
    try {
      await processStockRecord(record);
    } catch (error) {
      console.error(
        `[StockWorker] Error procesando mensaje ${record.messageId}:`,
        error,
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};

/**
 * Procesa un registro individual de SQS desempaquetando el sobre de SNS.
 */
async function processStockRecord(record: SQSRecord): Promise<void> {
  // 1. Desempaquetar el sobre de SNS (rawMessageDelivery: false)
  const snsEnvelope = JSON.parse(record.body) as {
    readonly Message: string;
    readonly MessageAttributes?: Record<string, { Value: string }>;
  };

  const domainEvent = JSON.parse(snsEnvelope.Message) as {
    readonly eventName: string;
    readonly occurredOn: string;
    readonly payload: StockDeductionPayload;
  };

  // 2. Filtrar solo los eventos relevantes para Inventario
  if (domainEvent.eventName !== "invoice.issued") {
    return;
  }

  const { invoiceId } = domainEvent.payload;

  // 3. Simulación de descuento atómico en base de datos con idempotencia
  if (invoiceId === "FORCE_POISON_PILL_TEST") {
    throw new Error("Simulación de fallo para prueba de Dead Letter Queue");
  }

  console.log(
    `[StockWorker] Stock sincronizado exitosamente para factura: ${invoiceId}`,
  );
}
