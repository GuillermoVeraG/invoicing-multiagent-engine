import { KinesisClient, PutRecordCommand } from "@aws-sdk/client-kinesis";
import { DomainEvent } from "../../domain/ports/event-publisher.port.js";
import { StreamPublishingError } from "../errors/infrastructure-error.js";

export interface KinesisAuditStreamerOptions {
  /**
   * Nombre del Kinesis Stream aprovisionado en AWS (ej. invoicing-audit-stream-dev).
   */
  readonly streamName: string;
  /**
   * Cliente inyectable para testing con LocalStack o mocks.
   */
  readonly client?: KinesisClient;
}

export interface KinesisStreamResult {
  readonly sequenceNumber?: string | undefined;
  readonly shardId?: string | undefined;
}

/**
 * Adaptador Secundario para streaming continuo de eventos contables y de auditoría en Amazon Kinesis.
 */
export class KinesisAuditStreamer {
  private readonly client: KinesisClient;
  private readonly streamName: string;

  constructor(options: KinesisAuditStreamerOptions) {
    if (!options.streamName) {
      throw new Error(
        "KinesisAuditStreamer requiere un 'streamName' válido en su configuración.",
      );
    }
    this.streamName = options.streamName;
    this.client = options.client ?? new KinesisClient({});
  }

  /**
   * Transmite un evento al Kinesis Data Stream.
   * La PartitionKey garantiza que todos los eventos de la misma entidad caigan en el mismo Shard (orden estricto FIFO).
   */
  public async streamEvent(
    event: DomainEvent,
    partitionKey: string,
  ): Promise<KinesisStreamResult> {
    const envelope = {
      eventName: event.eventName,
      occurredOn: event.occurredOn.toISOString(),
      payload: event.payload,
    };

    const command = new PutRecordCommand({
      StreamName: this.streamName,
      PartitionKey: partitionKey,
      Data: Buffer.from(JSON.stringify(envelope)),
    });

    try {
      const response = await this.client.send(command);
      return {
        sequenceNumber: response.SequenceNumber,
        shardId: response.ShardId,
      };
    } catch (error) {
      throw new StreamPublishingError(this.streamName, error);
    }
  }
}
