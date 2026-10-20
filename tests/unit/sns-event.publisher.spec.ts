import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { SnsEventPublisher } from "../../src/infrastructure/adapters/sns-event.publisher.js";
import { DomainEvent } from "../../src/domain/ports/event-publisher.port.js";
import { EventPublishingError } from "../../src/infrastructure/errors/infrastructure-error.js";

describe("SnsEventPublisher", () => {
  const topicArn = "arn:aws:sns:us-east-1:123456789012:invoice-events-test";
  let mockSend: ReturnType<typeof vi.fn>;
  let publisher: SnsEventPublisher;

  beforeEach(() => {
    mockSend = vi.fn();

    publisher = new SnsEventPublisher({
      topicArn,
      client: {
        send: mockSend,
      } as unknown as SNSClient,
    });
  });

  it("debe publicar un evento de dominio con su sobre y MessageAttributes para filtrado en SNS", async () => {
    mockSend.mockResolvedValueOnce({ MessageId: "msg-12345" });

    const domainEvent: DomainEvent = {
      eventName: "invoice.issued",
      occurredOn: new Date("2026-10-19T10:00:00.000Z"),
      payload: {
        invoiceId: "INV-999",
        total: 250,
        currency: "USD",
      },
    };

    await publisher.publish(domainEvent);

    expect(mockSend).toHaveBeenCalledOnce();
    const command = mockSend.mock.calls[0][0];

    expect(command).toBeInstanceOf(PublishCommand);
    expect(command.input.TopicArn).toBe(topicArn);

    // Validar el payload del mensaje
    const parsedBody = JSON.parse(command.input.Message);
    expect(parsedBody).toEqual({
      eventName: "invoice.issued",
      occurredOn: "2026-10-19T10:00:00.000Z",
      payload: {
        invoiceId: "INV-999",
        total: 250,
        currency: "USD",
      },
    });

    // Validar MessageAttributes para las Subscription Filter Policies
    expect(command.input.MessageAttributes).toEqual({
      eventName: {
        DataType: "String",
        StringValue: "invoice.issued",
      },
    });
  });

  it("debe capturar fallos de red de AWS y lanzar EventPublishingError tipado", async () => {
    const awsNetworkError = new Error("Connection reset by peer");
    mockSend.mockRejectedValueOnce(awsNetworkError);

    const domainEvent: DomainEvent = {
      eventName: "invoice.cancelled",
      occurredOn: new Date(),
      payload: { invoiceId: "INV-999" },
    };

    await expect(publisher.publish(domainEvent)).rejects.toThrow(
      EventPublishingError,
    );

    // Verificar que el error conserve el error original para observabilidad
    try {
      await publisher.publish(domainEvent);
    } catch (error) {
      if (error instanceof EventPublishingError) {
        expect(error.code).toBe("EVENT_PUBLISHING_FAILED");
        expect(error.originalError).toBe(awsNetworkError);
      }
    }
  });

  it("debe fallar en el constructor si no se provee un topicArn (Fail-Fast)", () => {
    expect(() => {
      new SnsEventPublisher({ topicArn: "" });
    }).toThrow("SnsEventPublisher requiere un 'topicArn' válido.");
  });
});
