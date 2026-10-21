import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageOperationError } from "../errors/infrastructure-error.js";

export interface S3DocumentServiceOptions {
  readonly bucketName: string;
  readonly client?: S3Client;
}

export interface PresignedUploadResult {
  readonly uploadUrl: string;
  readonly fileKey: string;
  readonly expiresInSeconds: number;
}

export class S3DocumentService {
  private readonly client: S3Client;
  private readonly bucketName: string;

  constructor(options: S3DocumentServiceOptions) {
    if (!options.bucketName) {
      throw new Error(
        "S3DocumentService requiere un 'bucketName' válido en su configuración.",
      );
    }
    this.bucketName = options.bucketName;
    this.client = options.client ?? new S3Client({});
  }

  /**
   * Genera una URL prefirmada temporal para DESCARGAR una factura en PDF directamente desde S3.
   * El bucket permanece con bloqueo público total (BLOCK_ALL).
   */
  public async generateDownloadUrl(
    invoiceId: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    const fileKey = `invoices/${invoiceId}.pdf`;

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: fileKey,
      ResponseContentType: "application/pdf",
    });

    try {
      return await getSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
      });
    } catch (error) {
      throw new StorageOperationError(
        `Generar URL prefirmada de descarga para factura "${invoiceId}"`,
        error,
      );
    }
  }

  /**
   * Genera una URL prefirmada temporal para SUBIR directamente un archivo PDF o XML a S3.
   * La Lambda no recibe el archivo binario; el cliente hace PUT directo a S3.
   */
  public async generateUploadUrl(
    invoiceId: string,
    fileExtension: "pdf" | "xml" = "pdf",
    expiresInSeconds = 300,
  ): Promise<PresignedUploadResult> {
    const fileKey = `invoices/${invoiceId}.${fileExtension}`;
    const contentType =
      fileExtension === "pdf" ? "application/pdf" : "application/xml";

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileKey,
      ContentType: contentType,
    });

    try {
      const uploadUrl = await getSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
      });

      return {
        uploadUrl,
        fileKey,
        expiresInSeconds,
      };
    } catch (error) {
      throw new StorageOperationError(
        `Generar URL prefirmada de subida para factura "${invoiceId}"`,
        error,
      );
    }
  }
}
