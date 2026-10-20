import { fail, ok, Result } from "../../shared/result.js";
import {
  DomainError,
  InvalidTaxRateError,
  InvalidTaxRegimeError,
} from "../errors/domain-error.js";
import { ITaxCalculator } from "../ports/tax-calculator.port.js";
import { ExemptVatCalculator } from "../strategies/exempt-vat.calculator.js";
import { StandardVatCalculator } from "../strategies/standard-vat.calculator.js";

export type TaxRegime = "STANDARD" | "EXEMPT";

export interface TaxCalculatorOptions {
  readonly regime: TaxRegime;
  readonly ratePercentage?: number | undefined;
}

/**
 * Patrón Factory: Centraliza la lógica de selección e instanciación
 * de la estrategia de cálculo de impuestos adecuada.
 */
export class TaxCalculatorFactory {
  public static create(
    options: TaxCalculatorOptions,
  ): Result<ITaxCalculator, DomainError> {
    switch (options.regime) {
      case "EXEMPT":
        return ok(new ExemptVatCalculator());

      case "STANDARD": {
        if (options.ratePercentage === undefined) {
          return fail(
            new InvalidTaxRateError(
              "El régimen STANDARD requiere especificar la tasa de impuesto (ratePercentage).",
            ),
          );
        }
        return StandardVatCalculator.create(options.ratePercentage);
      }

      default: {
        const exhaustiveCheck: never = options.regime;
        return fail(
          new InvalidTaxRegimeError(
            `Régimen tributario no soportado: "${exhaustiveCheck}"`,
          ),
        );
      }
    }
  }
}
