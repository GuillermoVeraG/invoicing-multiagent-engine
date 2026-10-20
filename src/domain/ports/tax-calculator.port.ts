import { Result } from "../../shared/result.js";
import { Money } from "../value-objects/money.vo.js";
import { InvoiceItem } from "../entities/invoice.entity.js";

/**
 * Puerto de Dominio que define el contrato del Patrón Strategy
 * para el cálculo fiscal de una factura.
 */
export interface ITaxCalculator {
  /**
   * Calcula el monto total de impuesto a partir del subtotal y los ítems.
   * Retorna un Result para manejar posibles errores matemáticos o de divisas.
   */
  calculateTax(
    subtotal: Money,
    items: ReadonlyArray<InvoiceItem>,
  ): Result<Money, string>;
}
