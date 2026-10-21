import { TaxRegime } from "../../domain/factories/tax-calculator.factory.js";

export interface CreateInvoiceItemDto {
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface CreateInvoiceDto {
  readonly customerTaxId: string;
  readonly items: ReadonlyArray<CreateInvoiceItemDto>;
  readonly taxRegime?: TaxRegime | undefined;
  readonly taxRatePercentage?: number | undefined;
}

export interface CreateInvoiceResponseDto {
  readonly invoiceId: string;
  readonly total: number;
  readonly status: string;
}
