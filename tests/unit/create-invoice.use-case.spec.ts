import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateInvoiceUseCase } from "../../src/application/use-cases/create-invoice.use-case.js";
import { IInvoiceRepository } from "../../src/domain/ports/invoice-repository.port.js";
import { IEventPublisher } from "../../src/domain/ports/event-publisher.port.js";

describe("CreateInvoiceUseCase", () => {
  let mockRepo: IInvoiceRepository;
  let mockPublisher: IEventPublisher;
  let useCase: CreateInvoiceUseCase;

  beforeEach(() => {
    mockRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null),
    };
    mockPublisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new CreateInvoiceUseCase(mockRepo, mockPublisher);
  });

  it("debe crear una factura y publicar el evento de dominio exitosamente calculando subtotal e impuestos", async () => {
    const result = await useCase.execute({
      customerTaxId: "TAX-900123456",
      taxRegime: "STANDARD",
      taxRatePercentage: 19,
      items: [
        { sku: "ITEM-A", quantity: 2, unitPrice: 100 },
        { sku: "ITEM-B", quantity: 1, unitPrice: 50 },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.invoiceId).toBeDefined();
      expect(result.value.total).toBe(297.5);
      expect(result.value.status).toBe("ISSUED");
    }

    expect(mockRepo.save).toHaveBeenCalledOnce();
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "invoice.issued",
        payload: expect.objectContaining({
          total: 297.5,
          currency: "USD",
          customerTaxId: "TAX-900123456",
        }),
      }),
    );
  });

  it("debe crear una factura EXEMPT con 0% de impuesto exitosamente", async () => {
    const result = await useCase.execute({
      customerTaxId: "TAX-900123456",
      taxRegime: "EXEMPT",
      items: [{ sku: "ITEM-SERVICE", quantity: 2, unitPrice: 100 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.total).toBe(200);
      expect(result.value.status).toBe("ISSUED");
    }
    expect(mockRepo.save).toHaveBeenCalledOnce();
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "invoice.issued",
        payload: expect.objectContaining({
          total: 200,
        }),
      }),
    );
  });

  it("debe fallar si el customeTaxId tiene un formato invalido", async () => {
    const result = await useCase.execute({
      customerTaxId: "123",
      taxRegime: "STANDARD",
      taxRatePercentage: 19,
      items: [{ sku: "ITEM-A", quantity: 1, unitPrice: 100 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("INVALID_TAX_ID");
    }
    expect(mockRepo.save).not.toHaveBeenCalled();
    expect(mockPublisher.publish).not.toHaveBeenCalled();
  });

  it("debe fallar si el porcentaje de impuesto es negativo o mayor a 100", async () => {
    const result = await useCase.execute({
      customerTaxId: "TAX-900123456",
      taxRegime: "STANDARD",
      taxRatePercentage: -5,
      items: [{ sku: "ITEM-A", quantity: 1, unitPrice: 100 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("INVALID_TAX_RATE");
    }
    expect(mockRepo.save).not.toHaveBeenCalled();
    expect(mockPublisher.publish).not.toHaveBeenCalled();
  });

  it("debe fallar si el precio de un item es negativo", async () => {
    const result = await useCase.execute({
      customerTaxId: "TAX-900123456",
      taxRegime: "STANDARD",
      taxRatePercentage: 19,
      items: [{ sku: "ITEM-A", quantity: 1, unitPrice: -50 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("INVALID_MONEY");
    }
    expect(mockRepo.save).not.toHaveBeenCalled();
    expect(mockPublisher.publish).not.toHaveBeenCalled();
  });

  it("debe fallar si la lista de item esta vacia", async () => {
    const result = await useCase.execute({
      customerTaxId: "TAX-900123456",
      taxRegime: "STANDARD",
      taxRatePercentage: 19,
      items: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("EMPTY_INVOICE_ITEMS");
    }
    expect(mockRepo.save).not.toHaveBeenCalled();
    expect(mockPublisher.publish).not.toHaveBeenCalled();
  });

  it("debe fallar si la cantidad de un item es menor o igual a cero", async () => {
    const result = await useCase.execute({
      customerTaxId: "TAX-900123456",
      taxRegime: "STANDARD",
      taxRatePercentage: 19,
      items: [{ sku: "ITEM-A", quantity: 0, unitPrice: 100 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("INVALID_INVOICE_ITEM");
    }
    expect(mockRepo.save).not.toHaveBeenCalled();
    expect(mockPublisher.publish).not.toHaveBeenCalled();
  });
});
