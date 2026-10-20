# Arquitectura del Sistema: Invoicing & Multi-Agent Accounting Pipeline

## 1. Visión General

El sistema implementa una arquitectura orientada a eventos (**Event-Driven Architecture**) y basada en microservicios serverless, siguiendo los principios de **Arquitectura Hexagonal (Ports & Adapters)** y **Domain-Driven Design (DDD)**.

El objetivo central es desacoplar las reglas críticas de negocio (cálculo de impuestos, totales, validaciones contables) de la infraestructura subyacente (AWS Lambda, DynamoDB, SQS, SNS, LLM APIs).

---

## 2. Diagrama de Flujo del Sistema

[Cliente / React Dashboard]
│
▼ HTTPS (REST)
[API Gateway]
│
▼
[Lambda: Core Invoicing] ──(Hexagonal: UseCase -> Ports)
│
├──► [DynamoDB: Invoices Table] (Single-Table Design / TransactWrite)
│
└──► [Event Publisher: SNS Topic]
│
├──► [SQS Queue: Stock Worker] ──► [Lambda Worker: Stock Sync]
│ │
│ ▼
│ [DynamoDB / Inventory]
│
├──► [SQS Queue: Audit Worker] ──► [Lambda Worker: Audit Agent]
│ │
│ ▼
│ [OpenAI / Claude API via MCP]
│ │
│ ▼
│ [PostgreSQL: Auditoría ACID]
│
└──► [Kinesis Data Stream] ──────► [S3 Data Lake: Raw Audit Trails]

---

## 3. Capas de la Arquitectura Hexagonal

Cada microservicio desacopla sus componentes en tres capas estrictas:

┌────────────────────────────────────────────────────────┐
│ DOMAIN │
│ - Entities (Invoice) │
│ - Value Objects (Money, TaxId) │
│ - Domain Events (InvoiceIssued) │
│ - Ports (IInvoiceRepository, IEventPublisher) │
│ - Errors (DomainError, InvalidTaxIdError) │
└───────────────────────────▲────────────────────────────┘
│ Depende de
┌───────────────────────────┴────────────────────────────┐
│ APPLICATION │
│ - Use Cases (CreateInvoiceUseCase, CancelInvoice) │
│ - DTOs (CreateInvoiceDto, CreateInvoiceResponseDto) │
└───────────────────────────▲────────────────────────────┘
│ Implementa / Consume
┌───────────────────────────┴────────────────────────────┐
│ INFRASTRUCTURE │
│ - Adapters Primarios (Driving): │
│ _ AWS Lambda Handlers │
│ _ SQS Event Consumers │
│ - Adapters Secundarios (Driven): │
│ _ DynamoDBInvoiceRepository (AWS SDK v3) │
│ _ SnsEventPublisher (AWS SDK v3) │
│ \* McpAgentAuditClient (Model Context Protocol) │
│ - CDK Stacks (IaC en TypeScript) │
└────────────────────────────────────────────────────────┘

---

## 4. Estrategia de Infraestructura (AWS CDK)

Toda la infraestructura se define en TypeScript utilizando **AWS CDK**:

1. **`MessagingStack`:**
   - SNS Topic: `invoice-events.fifo` o estándar para fan-out.
   - SQS Queues: Colas dedicadas por consumidor (`stock-update-queue`, `accounting-audit-queue`).
   - Dead Letter Queues (DLQ): Asociadas a cada cola con política de `maxReceiveCount: 3`.

2. **`PersistenceStack`:**
   - **DynamoDB:** Tabla transaccional `Invoices` con modo On-Demand. Clave compuesta `PK: INVOICE#<id>`, `SK: METADATA`.
   - **Aurora Serverless (PostgreSQL) / RDS:** Para balances contables que requieren soporte relacional 3NF y sentencias ACID complejas.
   - **S3 Bucket:** Almacenamiento inmutable de PDFs de facturas generadas y logs de auditoría.

3. **`ComputeStack`:**
   - Funciones **AWS Lambda** empaquetadas con `NodejsFunction` (esbuild).
   - Parámetro `ReportBatchItemFailures` activado en el `EventSourceMapping` de SQS para reintentos granulares.
   - Observabilidad integrada con `@aws-lambda-powertools/logger` y AWS X-Ray.

---

## 5. Integración con IA y MCP (Model Context Protocol)

El sistema expone las capacidades contables mediante un **Servidor MCP**:

- **Tools expuestas:**
  - `get_invoice_by_id(invoiceId)`: Consulta DynamoDB.
  - `reconcile_tax_variance(invoiceId, declaredTax)`: Comprueba diferencias contra el motor de reglas.
- **Agente Supervisor:** Utiliza Function Calling determinista validado mediante esquemas **Zod** antes de disparar ejecuciones a la base de datos o colas.

---

## 6. Seguridad y Resiliencia

- **IAM Least Privilege:** Cada Lambda tiene un rol exclusivo que solo permite `dynamodb:PutItem` sobre su ARN específico y `sqs:SendMessage` sobre su cola asignada.
- **Idempotencia:** Consumo seguro en Lambdas mediante claves de deduplicación en DynamoDB con TTL de 24 horas (`attribute_not_exists(message_id)`).
- **Cifrado:** Todos los datos en reposo cifrados mediante claves administradas en AWS KMS.
