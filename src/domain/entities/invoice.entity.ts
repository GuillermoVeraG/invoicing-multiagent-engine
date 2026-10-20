import { fail, ok, Result } from "../../shared/result.js";
import {
  DomainError,
  EmptyInvoiceItemsError,
  InvalidInvoiceItemError,
  InvalidInvoiceStatusTransitionError,
} from "../errors/domain-error.js";
import { ITaxCalculator } from "../ports/tax-calculator.port.js";
import { Money } from "../value-objects/money.vo.js";
import { TaxId } from "../value-objects/tax-id.vo.js";

export interface InvoiceItem {
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: Money;
}

export type InvoiceStatus = "DRAFT" | "ISSUED" | "CANCELLED";

export interface CreateInvoiceParams {
  readonly id: string;
  readonly customerTaxId: TaxId;
  readonly items: Array<InvoiceItem>;
  readonly taxCalculator: ITaxCalculator;
}

export class Invoice {
  private constructor(
    public readonly id: string,
    public readonly customerTaxId: TaxId,
    public readonly items: ReadonlyArray<InvoiceItem>,
    public readonly subtotal: Money,
    public readonly tax: Money,
    public readonly total: Money,
    public readonly status: InvoiceStatus,
    public readonly createdAt: Date,
  ) {}

  public static create(
    params: CreateInvoiceParams,
  ): Result<Invoice, DomainError> {
    if (params.items.length === 0) {
      return fail(new EmptyInvoiceItemsError());
    }

    const firstItem = params.items[0];
    if (!firstItem) {
      return fail(new EmptyInvoiceItemsError());
    }
    const invoiceCurrency = firstItem.unitPrice.currency;

    let subtotalAmount = 0;
    for (const item of params.items) {
      if (item.quantity <= 0) {
        return fail(
          new InvalidInvoiceItemError(
            `Cantidad inválida para SKU: ${item.sku}. Debe ser mayor a 0.`,
          ),
        );
      }

      if (item.unitPrice.currency !== invoiceCurrency) {
        return fail(
          new InvalidInvoiceItemError(
            `Discrepancia de divisas: el SKU "${item.sku}" está en ${item.unitPrice.currency}, pero la factura se emite en ${invoiceCurrency}.`,
          ),
        );
      }

      subtotalAmount += item.quantity * item.unitPrice.amount;
    }

    const subtotalResult = Money.create(subtotalAmount, invoiceCurrency);
    if (!subtotalResult.success) {
      return fail(new InvalidInvoiceItemError(subtotalResult.error));
    }
    const subtotal = subtotalResult.value;

    const taxResult = params.taxCalculator.calculateTax(subtotal, params.items);
    if (!taxResult.success) {
      return fail(new InvalidInvoiceItemError(taxResult.error));
    }
    const tax = taxResult.value;

    const totalResult = subtotal.add(tax);
    if (!totalResult.success) {
      return fail(new InvalidInvoiceItemError(totalResult.error));
    }
    const total = totalResult.value;

    return ok(
      new Invoice(
        params.id,
        params.customerTaxId,
        [...params.items],
        subtotal,
        tax,
        total,
        "ISSUED",
        new Date(),
      ),
    );
  }

  public cancel(): Result<Invoice, InvalidInvoiceStatusTransitionError> {
    if (this.status == "CANCELLED") {
      return fail(
        new InvalidInvoiceStatusTransitionError(this.status, "CANCELLED"),
      );
    }

    return ok(
      new Invoice(
        this.id,
        this.customerTaxId,
        this.items,
        this.subtotal,
        this.tax,
        this.total,
        "CANCELLED",
        this.createdAt,
      ),
    );
  }

  public static reconstitute(params: {
    readonly id: string;
    readonly customerTaxId: TaxId;
    readonly items: ReadonlyArray<InvoiceItem>;
    readonly subtotal: Money;
    readonly tax: Money;
    readonly total: Money;
    readonly status: InvoiceStatus;
    readonly createdAt: Date;
  }): Invoice {
    return new Invoice(
      params.id,
      params.customerTaxId,
      params.items,
      params.subtotal,
      params.tax,
      params.total,
      params.status,
      params.createdAt,
    );
  }
}
