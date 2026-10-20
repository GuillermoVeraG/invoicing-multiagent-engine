# Invoicing & Accounting Multi-Agent Event-Driven Engine

Motor backend transaccional de facturación electrónica y conciliación contable impulsado por eventos y agentes de IA. Diseñado bajo **Arquitectura Hexagonal (Ports & Adapters)**, **Domain-Driven Design (DDD)** y desplegado sobre infraestructura serverless en **AWS** con **TypeScript**.

---

## 💡 Visión General

El sistema resuelve la emisión y procesamiento de documentos fiscales de alto volumen mitigando los cuellos de botella clásicos de las transacciones síncronas:

- **Desacoplamiento temporal:** Ingesta inmediata en milisegundos persistiendo en **Amazon DynamoDB** y notificando mediante el patrón Fan-out (**Amazon SNS** + **Amazon SQS**).
- **Tolerancia a fallos:** Procesamiento por lotes en workers con reintento selectivo vía `ReportBatchItemFailures` y colas de mensajes no procesados (**DLQ**).
- **Consistencia e Idempotencia:** Prevención de duplicados en la entrega de eventos (_at-least-once_) con claves de deduplicación y expresiones condicionales.
- **Auditoría con Sistemas Multi-Agente:** Integración mediante el estándar **Model Context Protocol (MCP)** para que agentes de IA supervisen y concilien discrepancias contables contra esquemas estricto validados en runtime con Zod.

---

## 📚 Documentación Técnica Detallada

Para una inmersión completa en la toma de decisiones técnicas y el modelado conceptual del negocio, consulta la documentación en el directorio `docs/`:

- 📐 **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**: Especificación técnica completa, diagramas de flujo de microservicios, definición de capas hexagonales, diseño de infraestructura como código (AWS CDK), políticas IAM de mínimo privilegio y resiliencia de datos.
- 🧠 **[docs/CONCEPT.md](docs/CONCEPT.md)**: Fundamentos del negocio contable, justificación de patrones ante problemas reales en producción (cuándo usar DynamoDB vs PostgreSQL, Hot Partitions, Poison Pills) y glosario del Lenguaje Ubicuo (DDD).

---

## 🛠 Stack Tecnológico

- **Runtime & Lenguaje:** Node.js (ESM nativo) con TypeScript en modo estricto (`strict: true`, `noImplicitAny`, `noUncheckedIndexedAccess`).
- **Compute:** AWS Lambda empaquetado con `esbuild`.
- **Mensajería & Streaming:** AWS SNS, AWS SQS, AWS EventBridge y AWS Kinesis.
- **Bases de Datos:**
- **DynamoDB:** Single-Table Design transaccional para el core de facturación.
- **PostgreSQL:** Almacén relacional ACID para reportería y balances de auditoría.

- **Infraestructura como Código (IaC):** AWS CDK v2 en TypeScript.
- **Inteligencia Artificial:** OpenAI / Anthropic SDKs + Servidor Model Context Protocol (MCP).
- **Testing:** Vitest, LocalStack y Testcontainers.

---

## 📂 Estructura del Proyecto

El código fuente aísla estrictamente la lógica de dominio de la infraestructura:

```text
invoicing-service/
├── docs/
│   ├── ARCHITECTURE.md          # Especificación técnica, diagramas y contratos
│   └── CONCEPT.md               # Modelo del dominio, problemas resueltos y trade-offs
├── src/
│   ├── domain/                  # Núcleo puro de negocio (sin dependencias externas)
│   │   ├── entities/            # Entidades ricas e invariantes (Invoice)
│   │   ├── value-objects/       # Objetos de valor inmutables (Money, TaxId)
│   │   ├── ports/               # Interfaces / Contratos de entrada y salida (DIP)
│   │   └── errors/              # Excepciones y errores tipados del dominio
│   ├── application/             # Casos de uso y orquestación
│   │   ├── dtos/                # Data Transfer Objects serializables
│   │   └── use-cases/           # Implementación del flujo de aplicación (CreateInvoice)
│   ├── infrastructure/          # Adaptadores concretos y SDKs
│   │   ├── adapters/            # Implementaciones de repositorios y publicadores
│   │   └── lambdas/             # Handlers de AWS Lambda
│   └── shared/                  # Utilidades compartidas (Result Pattern funcional)
├── tests/
│   ├── unit/                    # Pruebas unitarias de dominio y casos de uso (mocks puros)
│   └── integration/             # Pruebas de integración con LocalStack / Contenedores
├── package.json
└── tsconfig.json

```

---

## 🏛 Principios de Diseño y Arquitectura

- **SOLID:**
- **S:** Separación estricta entre parseo de transporte (Lambda/HTTP), validación de invariantes (Entidades) y orquestación (Casos de uso).
- **O:** Estrategias polimórficas de cálculo de impuestos y procesadores de eventos abiertas a extensión sin modificar el núcleo.
- **L / I:** Interfaces de repositorios y publicadores segregadas y delgadas (`IInvoiceRepository`, `IEventPublisher`).
- **D:** Inversión de dependencias; los casos de uso dependen exclusivamente de interfaces ubicadas en `domain/ports`.

- **Manejo Funcional de Errores:** Adopción del tipo `Result<T, E>` para control de flujo determinista, eliminando el uso de `throw new Error` en reglas esperadas del negocio.

---

## 🚀 Instalación y Configuración

### Prerrequisitos

- Node.js >= 20.x
- npm >= 10.x
- Docker (requerido para LocalStack en pruebas de integración)

### Pasos

1. Clonar el repositorio:

```bash
git clone https://github.com/tu-usuario/invoicing-service.git
cd invoicing-service

```

2. Instalar dependencias:

```bash
npm install

```

3. Compilar el proyecto con TypeScript:

```bash
npm run build

```

---

## 🧪 Ejecución de Pruebas

El proyecto implementa la pirámide de pruebas automatizadas:

- **Pruebas Unitarias (Rápidas, sin red ni DB):**

```bash
npm run test:unit

```

- **Pruebas de Integración (contra LocalStack / DynamoDB Local):**

```bash
npm run test:integration

```

- **Verificación de Cobertura:**

```bash
npm run test:coverage

```

---

## 🔄 Pipeline de Eventos y Workers

1. **Emisión:** `CreateInvoiceUseCase` genera una factura y emite el evento `invoice.issued`.
2. **Fan-out:** AWS SNS difunde el payload hacia múltiples colas SQS suscritas.
3. **Consumo Concurrente:**

- **Inventario:** Descuenta existencias de los SKUs facturados mediante expresiones atómicas condicionales en DynamoDB.
- **Auditoría:** Encola el documento para revisión contra anomalías impositivas.

4. **Resiliencia:** Si un mensaje dentro de un batch falla, el handler responde únicamente con el ID del mensaje no procesado en `batchItemFailures`, evitando reprocesar mensajes exitosos.

---

## 🤖 Integración con IA y MCP

El microservicio expone un servidor **MCP (Model Context Protocol)** que permite a agentes supervisores consultar el estado contable y ejecutar acciones de diagnóstico:

- Herramientas expuestas bajo estándares abiertos (`tools`):
- `query_invoice_ledger`: Inspección de metadatos fiscales y subtotales.
- `audit_tax_discrepancy`: Comparación automática del valor impositivo declarado frente al cálculo de dominio.

- Los parámetros de entrada y respuestas de los LLMs son parseados contra esquemas **Zod** antes de cualquier invocación interna, garantizando ejecución determinista y segura en producción.
