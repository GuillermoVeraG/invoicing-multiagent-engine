import { Result } from "../../shared/result.js";
import { InvoiceItem } from "../entities/invoice.entity.js";
import { ITaxCalculator } from "../ports/tax-calculator.port.js";
import { Money } from "../value-objects/money.vo.js";

export class ExemptVatCalculator implements ITaxCalculator {
  public calculateTax(
    subtotal: Money,
    _items: ReadonlyArray<InvoiceItem>,
  ): Result<Money, string> {
    return Money.create(0, subtotal.currency);
  }
}
