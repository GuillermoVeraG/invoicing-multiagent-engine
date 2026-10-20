import * as cdk from "aws-cdk-lib";
import { PersistenceStack } from "../stacks/persistence.stack.js";
import { MessagingStack } from "../stacks/messaging.stack.js";
import { ComputeStack } from "../stacks/compute.stack.js";

const app = new cdk.App();

// 1. Detección dinámica de entorno (dev, staging, prod)
const stage = app.node.tryGetContext("stage") ?? process.env.STAGE ?? "dev";

// 2. Definición del entorno AWS (toma la cuenta y región configurada en AWS CLI o variables de entorno)
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

// -----------------------------------------------------------------------------
// 3. Instanciación en orden de dependencia unidireccional (Previene ciclos)
// -----------------------------------------------------------------------------

// Capa de Almacenamiento (DynamoDB + S3 con KMS)
const persistenceStack = new PersistenceStack(
  app,
  `InvoicingPersistence-${stage}`,
  {
    stage,
    env,
    description:
      "Capa de persistencia: Tabla DynamoDB Single-Table y S3 Bucket con ciclo de vida.",
  },
);

// Capa de Mensajería Asíncrona (SNS Fan-out + SQS + DLQs)
const messagingStack = new MessagingStack(app, `InvoicingMessaging-${stage}`, {
  stage,
  env,
  description:
    "Capa de mensajería: Tópico SNS y colas SQS con DLQ para Inventario y Auditoría IA.",
});

// Capa de Cómputo Serverless (AWS Lambdas)
// Conectamos los recursos exportados de los dos stacks anteriores
const computeStack = new ComputeStack(app, `InvoicingCompute-${stage}`, {
  stage,
  env,
  description:
    "Capa de cómputo: Lambdas Core y Workers SQS con ReportBatchItemFailures.",
  invoicesTable: persistenceStack.invoicesTable,
  documentsBucket: persistenceStack.documentsBucket,
  invoiceEventsTopic: messagingStack.invoiceEventsTopic,
  stockUpdateQueue: messagingStack.stockUpdateQueue,
  accountingAuditQueue: messagingStack.accountingAuditQueue,
});

// Explicitamos dependencias de CloudFormation para garantizar orden de despliegue
computeStack.addStackDependency(persistenceStack);
computeStack.addStackDependency(messagingStack);

// -----------------------------------------------------------------------------
// 4. Gobernanza y FinOps: Etiquetas globales aplicadas a todos los recursos
// -----------------------------------------------------------------------------
cdk.Tags.of(app).add("Project", "InvoicingMultiAgentEngine");
cdk.Tags.of(app).add("Environment", stage);
cdk.Tags.of(app).add("ManagedBy", "AWS-CDK");
cdk.Tags.of(app).add("CostCenter", "Engineering-Accounting");

// Sintetizar la plantilla CloudFormation
app.synth();
