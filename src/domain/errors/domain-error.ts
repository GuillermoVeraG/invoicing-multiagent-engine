export abstract class DomainError extends Error {
  public abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidTaxIdError extends DomainError {
  public readonly code = "INVALID_TAX_ID";
}

export class InvalidMoneyError extends DomainError {
  public readonly code = "INVALID_MONEY";
}

export class EmptyInvoiceItemsError extends DomainError {
  public readonly code = "EMPTY_INVOICE_ITEMS";

  constructor() {
    super("Una factura debe contener al menos un ítem.");
  }
}

export class InvalidInvoiceItemError extends DomainError {
  public readonly code = "INVALID_INVOICE_ITEM";
}

export class InvalidTaxRateError extends DomainError {
  public readonly code = "INVALID_TAX_RATE";
}

export class InvalidTaxRegimeError extends DomainError {
  public readonly code = "INVALID_TAX_REGIME";
}

export class InvoiceNotFoundError extends DomainError {
  public readonly code = "INVOICE_NOT_FOUND";

  constructor(invoiceId: string) {
    super(`Factura con identificador ${invoiceId} no fue encontrada.`);
  }
}

export class InvalidInvoiceStatusTransitionError extends DomainError {
  public readonly code = "INVALID_STATUS_TRANSITION";

  constructor(currentStatus: string, targetStatus: string) {
    super(
      `No se puede cambiar el estado de la factura de "${currentStatus}" a "${targetStatus}".`,
    );
  }
}
