# Documento Conceptual: ¿Qué problema resolvemos y por qué?

## 1. El Problema de Negocio

En sistemas de facturación electrónica y contabilidad masiva (como Alegra), la emisión de una factura no es una simple operación de base de datos. Dispara una reacción en cadena:

1. Validar reglas impositivas locales y números fiscales.
2. Descontar inventario de múltiples bodegas.
3. Notificar entidades tributarias.
4. Generar asientos contables en libros mayores.
5. Auditar anomalías fiscales o discrepancias de cálculo.

Si todo esto se ejecuta en una sola transacción síncrona HTTP (`POST /invoices`):

- Si falla la conexión con el inventario, la factura completa falla.
- Si el cálculo de impuestos es lento, la petición del cliente sufre latencia alta o timeout.
- Si el tráfico se multiplica por 10 (ej. cierre de mes), la base de datos relacional colapsa por conexiones abiertas concurrentes.

---

## 2. La Solución Técnica

Diseñamos un sistema **asíncrono, tolerante a fallos y extensible**:

1. **Aceptación Inmediata y Transaccional (Bajo Acoplamiento):**
   - El cliente emite la factura contra una Lambda que solo valida el dominio, la persiste en DynamoDB y publica el evento `invoice.issued`.
   - La respuesta al usuario toma menos de 100 ms.

2. **Propagación Concurrente (Fan-Out con SNS y SQS):**
   - El evento viaja al tópico SNS.
   - SNS distribuye copias del evento a múltiples colas SQS independientes:
     - Cola A alimenta al servicio de Inventario.
     - Cola B alimenta al servicio de Notificaciones.
     - Cola C alimenta al Agente de Auditoría con IA.
   - Si el servicio de inventario tiene problemas, sus mensajes se quedan seguros en su cola SQS sin afectar la emisión de facturas ni a los demás servicios.

3. **Auditoría Inteligente con Agentes e Integración MCP:**
   - En lugar de programar cientos de reglas estáticas para cada discrepancia contable, un **Agente de IA** procesa el stream de facturas.
   - Mediante **Model Context Protocol (MCP)**, el agente inspecciona de manera segura los datos fiscales, detecta incongruencias complejas y genera alertas para el equipo contable.

---

## 3. Matriz de Conceptos Clave

| Concepto                         | ¿Qué es en este proyecto?                                                              | ¿Por qué se eligió?                                                                                           |
| :------------------------------- | :------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| **Arquitectura Hexagonal**       | Separación entre lógica fiscal (Domain) y AWS/Bases de datos (Infrastructure).         | Permite probar el 100% de las reglas contables con pruebas unitarias en milisegundos sin tocar AWS.           |
| **Single-Table DynamoDB**        | Guardar entidades relacionadas en una sola tabla usando claves compuestas (`PK`/`SK`). | Latencia garantizada de un dígito en milisegundos sin importar el volumen de facturación.                     |
| **SQS + Batch Failures**         | Procesamiento por lotes en workers con reintento selectivo.                            | Evita reprocesar facturas que ya fueron descontadas de stock si un solo ítem del lote falló.                  |
| **Idempotencia**                 | Garantía de que procesar el mismo evento dos veces produce el mismo resultado exacto.  | Protege contra la entrega _at-least-once_ de AWS SQS, evitando duplicar inventario o cobros.                  |
| **MCP (Model Context Protocol)** | Protocolo estándar abierto para exponer herramientas de backend a modelos de lenguaje. | Desacopla los LLMs del código interno; las herramientas contables son reutilizables por cualquier cliente IA. |

---

## 4. Glosario del Negocio (Lenguaje Ubicuo)

- **Invoice (Factura):** Documento legal que formaliza una transacción comercial entre un emisor y un receptor.
- **TaxId (Identificación Tributaria):** Cadena estructurada que identifica unívocamente a una entidad jurídica o persona natural ante la autoridad fiscal.
- **Line Item (Ítem):** Renglón individual de la factura que contiene el producto (SKU), la cantidad vendida y su precio unitario.
- **Domain Event (Evento de Dominio):** Hecho inmutable que certifica que algo relevante ocurrió en el negocio (`invoice.issued`, `invoice.cancelled`).
- **DLQ (Dead Letter Queue):** Cola de descarte donde aterrizan mensajes que fallaron repetidamente para análisis forense sin bloquear el pipeline.
