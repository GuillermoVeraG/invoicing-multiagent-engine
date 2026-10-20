export interface DomainEvent {
  readonly eventName: string;
  readonly occurredOn: Date;
  readonly payload: Record<string, unknown>;
}

export interface IEventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
