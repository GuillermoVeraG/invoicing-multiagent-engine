/**
 * Clase base para todos los errores técnicos de infraestructura (red, base de datos, colas).
 * Mantiene la separación estricta: NO pertenece a DomainError.
 */
export abstract class InfrastructureError extends Error {
  public abstract readonly code: string;

  constructor(
    message: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EventPublishingError extends InfrastructureError {
  public readonly code = "EVENT_PUBLISHING_FAILED";

  constructor(eventName: string, originalError?: unknown) {
    super(
      `Fallo al publicar el evento de dominio "${eventName}" en el bus de mensajería.`,
      originalError,
    );
  }
}

export class DatabasePersistenceError extends InfrastructureError {
  public readonly code = "DATABASE_PERSISTENCE_FAILED";
  constructor(operation: string, originalError?: unknown) {
    super(
      `Fallo técnico de persistencia durante la operación: "${operation}".`,
      originalError,
    );
  }
}

export class DatabaseDataCorruptionError extends InfrastructureError {
  public readonly code = "DATABASE_DATA_CORRUPTION";
  constructor(detail: string) {
    super(
      `Inconsistencia o corrupción de datos en la base de datos: ${detail}`,
    );
  }
}

export class DatabaseConnectionError extends InfrastructureError {
  public readonly code = "DATABASE_CONNECTION_ERROR";
  constructor(databaseName: string, originalError?: unknown) {
    super(
      `No se pudo establecer conexión con el almacén de datos: "${databaseName}".`,
      originalError,
    );
  }
}

export class StreamPublishingError extends InfrastructureError {
  public readonly code = "STREAM_PUBLISHING_FAILED";
  constructor(streamName: string, originalError?: unknown) {
    super(
      `Fallo técnico al transmitir registro hacia Kinesis Stream "${streamName}".`,
      originalError,
    );
  }
}
