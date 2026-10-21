import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { z } from "zod";
import { CreateInvoiceUseCase } from "../../application/use-cases/create-invoice.use-case.js";
import { DynamoDbInvoiceRepository } from "../adapters/dynamodb-invoice.repository.js";
import { SnsEventPublisher } from "../adapters/sns-event.publisher.js";
import {
  buildSecureResponse,
  owaspSecurityHeaders,
} from "../security/security-headers.js";

// -----------------------------------------------------------------------------
// 1. Esquema de Validación en Runtime con Zod
// -----------------------------------------------------------------------------
export const createInvoiceSchema = z.object({
  customerTaxId: z
    .string()
    .min(6, "El TaxId debe tener mínimo 6 caracteres")
    .max(20, "El TaxId no puede exceder 20 caracteres"),
  taxRegime: z.enum(["STANDARD", "EXEMPT"]).optional(),
  taxRatePercentage: z
    .number()
    .min(0, "La tasa no puede ser negativa")
    .max(100, "La tasa no puede ser mayor a 100")
    .optional(),
  items: z
    .array(
      z.object({
        sku: z.string().min(1, "El SKU no puede estar vacío"),
        quantity: z
          .number()
          .int()
          .positive("La cantidad debe ser un entero mayor a 0"),
        unitPrice: z.number().nonnegative("El precio no puede ser negativo"),
      }),
    )
    .min(1, "Debe contener al menos un ítem"),
});

// -----------------------------------------------------------------------------
// 2. Inicialización en Scope Global (Optimización de Cold Starts)
// -----------------------------------------------------------------------------
const tableName = process.env.TABLE_NAME ?? "invoices-dev";
const topicArn =
  process.env.TOPIC_ARN ??
  "arn:aws:sns:us-east-1:123456789012:invoice-events-dev";

const invoiceRepo = new DynamoDbInvoiceRepository({ tableName });
const eventPublisher = new SnsEventPublisher({ topicArn });
const useCase = new CreateInvoiceUseCase(invoiceRepo, eventPublisher);

// -----------------------------------------------------------------------------
// 3. Handler de AWS Lambda
// -----------------------------------------------------------------------------
export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Manejo de Preflight CORS para navegadores
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: owaspSecurityHeaders,
      body: "",
    };
  }

  // 1. Validar presencia del cuerpo HTTP
  if (!event.body) {
    return buildSecureResponse(400, {
      error: "BAD_REQUEST",
      message: "El cuerpo de la petición no puede estar vacío.",
    });
  }

  // 2. Parseo y Validación en Runtime con Zod
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(event.body);
  } catch {
    return buildSecureResponse(400, {
      error: "INVALID_JSON",
      message: "El cuerpo de la petición no es un JSON válido.",
    });
  }

  const validationResult = createInvoiceSchema.safeParse(rawJson);
  if (!validationResult.success) {
    return buildSecureResponse(422, {
      error: "VALIDATION_FAILED",
      message: validationResult.error.format(),
    });
  }

  // 3. Ejecución del Caso de Uso Hexagonal
  try {
    const result = await useCase.execute({
      customerTaxId: validationResult.data.customerTaxId,
      items: validationResult.data.items,
      taxRegime: validationResult.data.taxRegime,
      taxRatePercentage: validationResult.data.taxRatePercentage,
    });

    if (!result.success) {
      const error = result.error;
      const statusCode = error.code === "INVOICE_NOT_FOUND" ? 404 : 400;

      return buildSecureResponse(statusCode, {
        error: error.code,
        message: error.message,
      });
    }

    // 4. Respuesta Exitosa 201 Created
    return buildSecureResponse(201, {
      message: "Factura emitida exitosamente",
      data: result.value,
    });
  } catch (error) {
    // 5. Fallos no controlados de infraestructura (500)
    return buildSecureResponse(500, {
      error: "INTERNAL_SERVER_ERROR",
      message:
        error instanceof Error ? error.message : "Error interno desconocido.",
    });
  }
};
