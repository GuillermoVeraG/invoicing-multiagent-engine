import { fail, ok, Result } from "../../shared/result.js";

export class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: string,
  ) {}

  public static create(
    amount: number,
    currency = "USD",
  ): Result<Money, string> {
    if (amount < 0) {
      return fail("El monto no puede ser negativo.");
    }
    // Evitamos problemas de coma flotante redondeando a 2 decimales
    const rounded = Math.round(amount * 100) / 100;
    return ok(new Money(rounded, currency.toUpperCase()));
  }

  public add(other: Money): Result<Money, string> {
    if (this.currency !== other.currency) {
      return fail("No se pueden sumar montos con diferentes divisas.");
    }
    return Money.create(this.amount + other.amount, this.currency);
  }
}
