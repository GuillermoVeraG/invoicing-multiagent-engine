export interface CancelInvoiceDto {
  readonly invoiceId: string;
}

export interface CancelInvoiceResponseDto {
  readonly invoiceId: string;
  readonly status: "CANCELLED";
}
