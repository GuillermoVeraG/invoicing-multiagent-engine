import { fail, ok, Result } from "../../shared/result.js";
import {
  DomainError,
  InvalidTaxIdError,
  InvalidMoneyError,
} from "../../domain/errors/domain-error.js";
import { Invoice, InvoiceItem } from "../../domain/entities/invoice.entity.js";
import { IInvoiceRepository } from "../../domain/ports/invoice-repository.port.js";
import { IEventPublisher } from "../../domain/ports/event-publisher.port.js";
import { Money } from "../../domain/value-objects/money.vo.js";
import { TaxId } from "../../domain/value-objects/tax-id.vo.js";
import { TaxCalculatorFactory } from "../../domain/factories/tax-calculator.factory.js";
import {
  CreateInvoiceDto,
  CreateInvoiceResponseDto,
} from "../dtos/create-invoice.dto.js";

export class CreateInvoiceUseCase {
  constructor(
    private readonly invoiceRepo: IInvoiceRepository,
    private readonly eventPublisher: IEventPublisher,
  ) {}

  public async execute(
    dto: CreateInvoiceDto,
  ): Promise<Result<CreateInvoiceResponseDto, DomainError>> {
    // 1. Validar el identificador fiscal mediante su Value Object
    const taxIdResult = TaxId.create(dto.customerTaxId);
    if (!taxIdResult.success) {
      return fail(new InvalidTaxIdError(taxIdResult.error));
    }
    const customerTaxId = taxIdResult.value;

    const taxCalculatorResult = TaxCalculatorFactory.create({
      regime: dto.taxRegime ?? "STANDARD",
      ratePercentage: dto.taxRatePercentage,
    });
    if (!taxCalculatorResult.success) {
      return fail(taxCalculatorResult.error);
    }
    const taxCalculator = taxCalculatorResult.value;

    // 2. Transformar y validar cada ítem usando el Value Object Money
    const domainItems: InvoiceItem[] = [];

    for (const item of dto.items) {
      const moneyResult = Money.create(item.unitPrice);
      if (!moneyResult.success) {
        return fail(
          new InvalidMoneyError(
            `Precio inválido para SKU ${item.sku}: ${moneyResult.error}`,
          ),
        );
      }

      domainItems.push({
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: moneyResult.value,
      });
    }

    // 3. Crear la entidad de dominio Invoice (valida invariantes de agregación)
    const invoiceResult = Invoice.create({
      id: crypto.randomUUID(),
      customerTaxId,
      items: domainItems,
      taxCalculator,
    });

    if (!invoiceResult.success) {
      return fail(invoiceResult.error);
    }

    const invoice = invoiceResult.value;

    // Persistencia mediante puerto
    await this.invoiceRepo.save(invoice);

    // Publicación asíncrona mediante puerto
    await this.eventPublisher.publish({
      eventName: "invoice.issued",
      occurredOn: new Date(),
      payload: {
        invoiceId: invoice.id,
        customerTaxId: invoice.customerTaxId.value,
        total: invoice.total.amount,
        currency: invoice.total.currency,
      },
    });

    return ok({
      invoiceId: invoice.id,
      total: invoice.total.amount,
      status: invoice.status,
    });
  }
}
