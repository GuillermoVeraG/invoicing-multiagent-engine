import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { SecretsManagerService } from "../../src/infrastructure/security/secrets-manager.service.js";
import { SecretRetrievalError } from "../../src/infrastructure/errors/infrastructure-error.js";

describe("SecretsManagerService", () => {
  let mockSend: ReturnType<typeof vi.fn>;
  let service: SecretsManagerService;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSend = vi.fn();
    service = new SecretsManagerService({
      send: mockSend,
    } as unknown as SecretsManagerClient);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debe consultar AWS la primera vez y retornar desde la caché en la segunda llamada (Cache Hit)", async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: "postgres://user:pass@localhost:5432/invoicing",
    });

    // 1. Primera llamada: Cache Miss -> consulta a AWS
    const firstCall = await service.getSecret("db/credentials");
    expect(firstCall).toBe("postgres://user:pass@localhost:5432/invoicing");
    expect(mockSend).toHaveBeenCalledTimes(1);

    // 2. Segunda llamada inmediata: Cache Hit -> debe salir de RAM
    const secondCall = await service.getSecret("db/credentials");
    expect(secondCall).toBe("postgres://user:pass@localhost:5432/invoicing");

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("debe volver a consultar a AWS cuando el TTL de la caché haya expirado", async () => {
    mockSend
      .mockResolvedValueOnce({ SecretString: "old-password" })
      .mockResolvedValueOnce({ SecretString: "new-rotated-password" });

    // TTL de 10 segundos para la prueba
    const ttlMs = 10_000;

    const first = await service.getSecret("api/key", ttlMs);
    expect(first).toBe("old-password");
    expect(mockSend).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(15_000);

    const second = await service.getSecret("api/key", ttlMs);
    expect(second).toBe("new-rotated-password");
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("debe deserializar secretos estructurados en formato JSON tipado", async () => {
    const credentials = {
      host: "db.aws.internal",
      port: 5432,
      username: "admin",
    };
    mockSend.mockResolvedValueOnce({
      SecretString: JSON.stringify(credentials),
    });

    const parsed = await service.getSecretJson<{ host: string; port: number }>(
      "db/config",
    );

    expect(parsed.host).toBe("db.aws.internal");
    expect(parsed.port).toBe(5432);
  });

  it("debe capturar errores de AWS y lanzar SecretRetrievalError tipado", async () => {
    mockSend.mockRejectedValue(new Error("ResourceNotFoundException"));

    await expect(service.getSecret("non-existent-secret")).rejects.toThrow(
      SecretRetrievalError,
    );
  });
});
