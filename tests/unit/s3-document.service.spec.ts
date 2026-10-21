import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import * as presigner from "@aws-sdk/s3-request-presigner";
import { S3DocumentService } from "../../src/infrastructure/adapters/s3-document.service.js";
import { StorageOperationError } from "../../src/infrastructure/errors/infrastructure-error.js";

// Mockeamos la librería oficial de prefirmado de AWS
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));

describe("S3DocumentService", () => {
  const bucketName = "invoicing-docs-test-bucket";
  let service: S3DocumentService;
  let mockGetSignedUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSignedUrl = vi.mocked(presigner.getSignedUrl);

    service = new S3DocumentService({
      bucketName,
      client: {} as S3Client,
    });
  });

  it("debe generar una URL prefirmada de descarga para una factura en PDF", async () => {
    const fakeSignedUrl =
      "https://s3.amazonaws.com/invoicing-docs-test-bucket/invoices/INV-101.pdf?X-Amz-Signature=xyz";
    mockGetSignedUrl.mockResolvedValueOnce(fakeSignedUrl);

    const url = await service.generateDownloadUrl("INV-101", 600);

    expect(url).toBe(fakeSignedUrl);
    expect(mockGetSignedUrl).toHaveBeenCalledOnce();

    const [, command, options] = mockGetSignedUrl.mock.calls[0]!;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: bucketName,
      Key: "invoices/INV-101.pdf",
      ResponseContentType: "application/pdf",
    });
    expect(options).toEqual({ expiresIn: 600 });
  });

  it("debe generar una URL prefirmada de subida (PUT) para XML tributario", async () => {
    const fakeUploadUrl =
      "https://s3.amazonaws.com/invoicing-docs-test-bucket/invoices/INV-202.xml?X-Amz-Signature=abc";
    mockGetSignedUrl.mockResolvedValueOnce(fakeUploadUrl);

    const result = await service.generateUploadUrl("INV-202", "xml", 300);

    expect(result).toEqual({
      uploadUrl: fakeUploadUrl,
      fileKey: "invoices/INV-202.xml",
      expiresInSeconds: 300,
    });

    const [, command, options] = mockGetSignedUrl.mock.calls[0]!;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: bucketName,
      Key: "invoices/INV-202.xml",
      ContentType: "application/xml",
    });
    expect(options).toEqual({ expiresIn: 300 });
  });

  it("debe capturar errores de firma y lanzar StorageOperationError tipado", async () => {
    mockGetSignedUrl.mockRejectedValue(
      new Error("KMS Key not found or signing error"),
    );

    await expect(service.generateDownloadUrl("INV-ERROR")).rejects.toThrow(
      StorageOperationError,
    );

    try {
      await service.generateDownloadUrl("INV-ERROR");
    } catch (error) {
      if (error instanceof StorageOperationError) {
        expect(error.code).toBe("STORAGE_OPERATION_FAILED");
      }
    }
  });

  it("debe fallar en el constructor si bucketName viene vacío (Fail-Fast)", () => {
    expect(() => {
      new S3DocumentService({ bucketName: "" });
    }).toThrow(
      "S3DocumentService requiere un 'bucketName' válido en su configuración.",
    );
  });
});
