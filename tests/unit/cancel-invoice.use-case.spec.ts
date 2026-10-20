import { describe, it, expect, vi, beforeEach } from "vitest";
import { CancelInvoiceUseCase } from "../../src/application/use-cases/cancel-invoice.use-case.js";
import { IInvoiceRepository } from "../../src/domain/ports/invoice-repository.port.js";
import { IEventPublisher } from "../../src/domain/ports/event-publisher.port.js";
import { Invoice } from "../../src/domain/entities/invoice.entity.js";
import { TaxId } from "../../src/domain/value-objects/tax-id.vo.js";
import { Money } from "../../src/domain/value-objects/money.vo.js";
import { ExemptVatCalculator } from "../../src/domain/strategies/exempt-vat.calculator.js";

describe("CancelInvoiceUseCase", () => {
  let mockRepo: IInvoiceRepository;
  let mockPublisher: IEventPublisher;
  let useCase: CancelInvoiceUseCase;

  const createTestInvoice = (id = "INV-123456"): Invoice => {
    const taxId = TaxId.create("TAX-900123456");
    const money = Money.create(100);
    if (!taxId.success || !money.success) throw new Error("Setup error");

    const invoiceResult = Invoice.create({
      id,
      customerTaxId: taxId.value,
      items: [{ sku: "SKU-TEST", quantity: 1, unitPrice: money.value }],
      taxCalculator: new ExemptVatCalculator(),
    });

    if (!invoiceResult.success) throw new Error("Setup error");
    return invoiceResult.value;
  };

  beforeEach(() => {
    mockRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
    };

    mockPublisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new CancelInvoiceUseCase(mockRepo, mockPublisher);
  });

  it("debe cancelar una factura emitida y emitir el evento invoice.cancelled exitosamente", async () => {
    const activeInvoice = createTestInvoice("INV-123456");
    vi.mocked(mockRepo.findById).mockResolvedValue(activeInvoice);

    const result = await useCase.execute({ invoiceId: "INV-123456" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.status).toBe("CANCELLED");
      expect(result.value.invoiceId).toBe("INV-123456");
    }

    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "CANCELLED",
      }),
    );

    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "invoice.cancelled",
        payload: expect.objectContaining({
          invoiceId: "INV-123456",
        }),
      }),
    );
  });

  it("debe fallar con INVOICE_NOT_FOUND si la factura no existe en el repositorio", async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({ invoiceId: "NON-EXISTENT" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("INVOICE_NOT_FOUND");
    }

    expect(mockRepo.save).not.toHaveBeenCalled();
    expect(mockPublisher.publish).not.toHaveBeenCalled();
  });

  it("debe fallar si se intenta cancelar una factura que ya estaba cancelada", async () => {
    const activeInvoice = createTestInvoice("INV-123456");
    // La cancelamos previamente
    const cancelledInvoiceResult = activeInvoice.cancel();
    if (!cancelledInvoiceResult.success) throw new Error("Setup error");

    vi.mocked(mockRepo.findById).mockResolvedValue(
      cancelledInvoiceResult.value,
    );

    const result = await useCase.execute({ invoiceId: "INV-123456" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("INVALID_STATUS_TRANSITION");
    }

    expect(mockRepo.save).not.toHaveBeenCalled();
    expect(mockPublisher.publish).not.toHaveBeenCalled();
  });
});
