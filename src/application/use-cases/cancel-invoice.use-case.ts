import { fail, ok, Result } from "../../shared/result.js";
import {
  DomainError,
  InvoiceNotFoundError,
} from "../../domain/errors/domain-error.js";
import { IInvoiceRepository } from "../../domain/ports/invoice-repository.port.js";
import { IEventPublisher } from "../../domain/ports/event-publisher.port.js";
import {
  CancelInvoiceDto,
  CancelInvoiceResponseDto,
} from "../dtos/cancel-invoice.dto.js";

export class CancelInvoiceUseCase {
  constructor(
    private readonly invoiceRepo: IInvoiceRepository,
    private readonly eventPublisher: IEventPublisher,
  ) {}

  public async execute(
    dto: CancelInvoiceDto,
  ): Promise<Result<CancelInvoiceResponseDto, DomainError>> {
    const invoice = await this.invoiceRepo.findById(dto.invoiceId);
    if (!invoice) {
      return fail(new InvoiceNotFoundError(dto.invoiceId));
    }

    const cancelResult = invoice.cancel();
    if (!cancelResult.success) {
      return fail(cancelResult.error);
    }

    const cancelledInvoice = cancelResult.value;

    await this.invoiceRepo.save(cancelledInvoice);

    await this.eventPublisher.publish({
      eventName: "invoice.cancelled",
      occurredOn: new Date(),
      payload: {
        invoiceId: cancelledInvoice.id,
        customerTaxId: cancelledInvoice.customerTaxId.value,
        total: cancelledInvoice.total.amount,
        currency: cancelledInvoice.total.currency,
      },
    });

    return ok({
      invoiceId: cancelledInvoice.id,
      status: "CANCELLED",
    });
  }
}
