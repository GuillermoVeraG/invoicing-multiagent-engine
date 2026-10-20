import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import {
  DomainEvent,
  IEventPublisher,
} from "../../domain/ports/event-publisher.port.js";
import { EventPublishingError } from "../errors/infrastructure-error.js";

export interface SnsEventPublisherOptions {
  readonly topicArn: string;
  readonly client?: SNSClient;
}

/**
 * Adaptador Secundario (Driven Adapter) que publica eventos de dominio en Amazon SNS.
 */
export class SnsEventPublisher implements IEventPublisher {
  private readonly client: SNSClient;
  private readonly topicArn: string;

  constructor(options: SnsEventPublisherOptions) {
    if (!options.topicArn) {
      throw new Error("SnsEventPublisher requiere un 'topicArn' válido.");
    }
    this.topicArn = options.topicArn;
    this.client = options.client ?? new SNSClient({});
  }

  /**
   * Publica el evento de dominio serializado en JSON con MessageAttributes para filtrado.
   */
  public async publish(event: DomainEvent): Promise<void> {
    const messageEnvelope = {
      eventName: event.eventName,
      occurredOn: event.occurredOn.toISOString(),
      payload: event.payload,
    };

    const command = new PublishCommand({
      TopicArn: this.topicArn,
      Message: JSON.stringify(messageEnvelope),
      MessageAttributes: {
        eventName: {
          DataType: "String",
          StringValue: event.eventName,
        },
      },
    });

    try {
      await this.client.send(command);
    } catch (error) {
      throw new EventPublishingError(event.eventName, error);
    }
  }
}
