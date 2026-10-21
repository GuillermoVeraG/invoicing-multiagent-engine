import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { SecretRetrievalError } from "../errors/infrastructure-error.js";

interface CachedSecret {
  readonly value: string;
  readonly expiresAt: number;
}

export class SecretsManagerService {
  private readonly client: SecretsManagerClient;
  private readonly cache = new Map<string, CachedSecret>();

  constructor(client?: SecretsManagerClient) {
    this.client = client ?? new SecretsManagerClient({});
  }

  /**
   * Recupera un secreto.
   */
  public async getSecret(secretId: string, ttlMs = 900_000): Promise<string> {
    const now = Date.now();
    const cached = this.cache.get(secretId);

    if (cached && now < cached.expiresAt) {
      return cached.value;
    }

    try {
      const response = await this.client.send(
        new GetSecretValueCommand({ SecretId: secretId }),
      );

      let secretValue: string;
      if (response.SecretString) {
        secretValue = response.SecretString;
      } else if (response.SecretBinary) {
        secretValue = Buffer.from(response.SecretBinary).toString("utf-8");
      } else {
        throw new Error(`El secreto "${secretId}" no contiene datos válidos.`);
      }

      this.cache.set(secretId, {
        value: secretValue,
        expiresAt: now + ttlMs,
      });

      return secretValue;
    } catch (error) {
      throw new SecretRetrievalError(secretId, error);
    }
  }

  /**
   * Recupera un secreto estructurado y lo parsea como JSON tipado.
   */
  public async getSecretJson<T>(secretId: string, ttlMs = 900_000): Promise<T> {
    const rawSecret = await this.getSecret(secretId, ttlMs);
    try {
      return JSON.parse(rawSecret) as T;
    } catch {
      throw new SecretRetrievalError(
        secretId,
        new Error(`El secreto "${secretId}" no es un JSON válido.`),
      );
    }
  }

  /**
   * Invalida manualmente la caché.
   */
  public clearCache(secretId?: string): void {
    if (secretId) {
      this.cache.delete(secretId);
    } else {
      this.cache.clear();
    }
  }
}
