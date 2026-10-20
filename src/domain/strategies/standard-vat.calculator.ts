import { fail, ok, Result } from "../../shared/result.js";
import { InvoiceItem } from "../entities/invoice.entity.js";
import { InvalidTaxRateError } from "../errors/domain-error.js";
import { ITaxCalculator } from "../ports/tax-calculator.port.js";
import { Money } from "../value-objects/money.vo.js";

export class StandardVatCalculator implements ITaxCalculator {
  private constructor(public readonly ratePercentage: number) {}

  public static create(
    ratePercentage: number,
  ): Result<StandardVatCalculator, InvalidTaxRateError> {
    if (ratePercentage < 0 || ratePercentage > 100) {
      return fail(
        new InvalidTaxRateError(
          "El porcentaje de impuesto debe estar entre 0 y 100.",
        ),
      );
    }
    return ok(new StandardVatCalculator(ratePercentage));
  }

  public calculateTax(
    subtotal: Money,
    _items: ReadonlyArray<InvoiceItem>,
  ): Result<Money, string> {
    const rawTaxAmount = (subtotal.amount * this.ratePercentage) / 100;
    return Money.create(rawTaxAmount, subtotal.currency);
  }
}
