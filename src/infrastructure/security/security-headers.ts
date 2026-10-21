export const owaspSecurityHeaders: Readonly<Record<string, string>> = {
  // 1. Prevenir ataques de Cross-Site Scripting (XSS) y Clickjacking
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none';",
  "X-Frame-Options": "DENY",

  // 2. Prevenir que el navegador adivine el MIME-Type (Anti-MIME Sniffing)
  "X-Content-Type-Options": "nosniff",

  // 3. Forzar HTTPS estricto durante 1 año (HSTS)
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",

  // 4. Proteger datos fiscales confidenciales en proxies y cachés públicas
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",

  // 5. CORS seguro y Content-Type estándar
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With",
};

/**
 * Helper para construir respuestas HTTP seguras y homogéneas para API Gateway.
 */
export function buildSecureResponse(
  statusCode: number,
  body: Record<string, unknown> | string,
  extraHeaders?: Record<string, string>,
) {
  return {
    statusCode,
    headers: {
      ...owaspSecurityHeaders,
      ...extraHeaders,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}
