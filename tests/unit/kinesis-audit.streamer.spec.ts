import { describe, it, expect, vi, beforeEach } from "vitest";
import { KinesisClient, PutRecordCommand } from "@aws-sdk/client-kinesis";
import { KinesisAuditStreamer } from "../../src/infrastructure/adapters/kinesis-audit.streamer.js";
import { DomainEvent } from "../../src/domain/ports/event-publisher.port.js";
import { StreamPublishingError } from "../../src/infrastructure/errors/infrastructure-error.js";

describe("KinesisAuditStreamer", () => {
  const streamName = "invoicing-audit-stream-test";
  let mockSend: ReturnType<typeof vi.fn>;
  let streamer: KinesisAuditStreamer;

  beforeEach(() => {
    mockSend = vi.fn();
    streamer = new KinesisAuditStreamer({
      streamName,
      client: {
        send: mockSend,
      } as unknown as KinesisClient,
    });
  });

  it("debe transmitir el evento como buffer binario con la PartitionKey correcta", async () => {
    mockSend.mockResolvedValueOnce({
      SequenceNumber: "seq-123456789",
      ShardId: "shardId-000000000000",
    });

    const domainEvent: DomainEvent = {
      eventName: "invoice.issued",
      occurredOn: new Date("2026-10-20T12:00:00.000Z"),
      payload: {
        invoiceId: "INV-500",
        customerTaxId: "TAX-900123456",
        total: 500,
      },
    };

    const result = await streamer.streamEvent(domainEvent, "TAX-900123456");

    expect(mockSend).toHaveBeenCalledOnce();
    const command = mockSend.mock.calls[0][0];

    expect(command).toBeInstanceOf(PutRecordCommand);
    expect(command.input.StreamName).toBe(streamName);
    expect(command.input.PartitionKey).toBe("TAX-900123456");

    // Decodificar el Buffer binario para verificar que el JSON sea íntegro
    const decodedPayload = JSON.parse(
      Buffer.from(command.input.Data as Uint8Array).toString("utf-8"),
    );

    expect(decodedPayload).toEqual({
      eventName: "invoice.issued",
      occurredOn: "2026-10-20T12:00:00.000Z",
      payload: {
        invoiceId: "INV-500",
        customerTaxId: "TAX-900123456",
        total: 500,
      },
    });

    expect(result.sequenceNumber).toBe("seq-123456789");
    expect(result.shardId).toBe("shardId-000000000000");
  });

  it("debe capturar fallos de Kinesis y lanzar StreamPublishingError tipado", async () => {
    const kinesisError = new Error("ProvisionedThroughputExceededException");
    mockSend.mockRejectedValue(kinesisError);

    const domainEvent: DomainEvent = {
      eventName: "invoice.cancelled",
      occurredOn: new Date(),
      payload: { invoiceId: "INV-500" },
    };

    await expect(
      streamer.streamEvent(domainEvent, "TAX-900123456"),
    ).rejects.toThrow(StreamPublishingError);

    try {
      await streamer.streamEvent(domainEvent, "TAX-900123456");
    } catch (error) {
      if (error instanceof StreamPublishingError) {
        expect(error.code).toBe("STREAM_PUBLISHING_FAILED");
        expect(error.originalError).toBe(kinesisError);
      }
    }
  });

  it("debe fallar en el constructor si streamName viene vacío (Fail-Fast)", () => {
    expect(() => {
      new KinesisAuditStreamer({ streamName: "" });
    }).toThrow(
      "KinesisAuditStreamer requiere un 'streamName' válido en su configuración.",
    );
  });
});
