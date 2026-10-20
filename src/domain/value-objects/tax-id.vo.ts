import { fail, ok, Result } from "../../shared/result.js";

export class TaxId {
  private constructor(public readonly value: string) {}

  public static create(rawTaxId: string): Result<TaxId, string> {
    const cleaned = rawTaxId.trim();

    if (!cleaned) {
      return fail("El identificador fiscal (Tax ID) no puede estar vacío.");
    }

    // Regla de ejemplo: alfanumérico con guiones, entre 6 y 20 caracteres
    const taxIdRegex = /^[A-Za-z0-9-]{6,20}$/;
    if (!taxIdRegex.test(cleaned)) {
      return fail(
        `Formato de Tax ID inválido: "${cleaned}". Debe tener entre 6 y 20 caracteres alfanuméricos.`,
      );
    }

    return ok(new TaxId(cleaned.toUpperCase()));
  }

  public equals(other: TaxId): boolean {
    return this.value === other.value;
  }
}
