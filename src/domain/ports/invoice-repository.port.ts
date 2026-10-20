import { Invoice } from "../entities/invoice.entity.js";

export interface IInvoiceRepository {
  save(invoice: Invoice): Promise<void>;
  findById(id: string): Promise<Invoice | null>;
}
