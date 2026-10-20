import { Duration, Stack, StackProps } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export interface ComputeStackProps extends StackProps {
  readonly stage?: string;
  // Inyección de dependencias entre Stacks (Cross-Stack references desacopladas)
  readonly invoicesTable: dynamodb.Table;
  readonly documentsBucket: s3.Bucket;
  readonly invoiceEventsTopic: sns.Topic;
  readonly stockUpdateQueue: sqs.Queue;
  readonly accountingAuditQueue: sqs.Queue;
}

export class ComputeStack extends Stack {
  /**
   * Lambda que ejecuta el CreateInvoiceUseCase cuando llega una petición HTTP.
   */
  public readonly createInvoiceFunction: lambda.Function;

  /**
   * Worker que descuenta inventario consumiendo la cola SQS de stock.
   */
  public readonly stockWorkerFunction: lambda.Function;

  /**
   * Worker que orquesta el Agente IA (LangGraph + Phoenix + MCP) para conciliar discrepancias.
   */
  public readonly auditAgentWorkerFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const stage = props.stage ?? "dev";

    // -------------------------------------------------------------------------
    // 1. Lambda: Core Invoicing (API Gateway -> UseCase -> DynamoDB + SNS)
    // -------------------------------------------------------------------------
    this.createInvoiceFunction = new lambda.Function(
      this,
      "CreateInvoiceFunction",
      {
        functionName: `invoicing-core-${stage}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "index.handler",
        // Apunta al directorio compilado de la aplicación
        code: lambda.Code.fromAsset("dist"),
        memorySize: 512,
        timeout: Duration.seconds(10),
        environment: {
          STAGE: stage,
          TABLE_NAME: props.invoicesTable.tableName,
          TOPIC_ARN: props.invoiceEventsTopic.topicArn,
        },
      },
    );

    // IAM Least Privilege con métodos L2 de CDK:
    // Solo puede escribir/leer en la tabla Invoices y publicar en el tópico de eventos
    props.invoicesTable.grantReadWriteData(this.createInvoiceFunction);
    props.invoiceEventsTopic.grantPublish(this.createInvoiceFunction);

    // -------------------------------------------------------------------------
    // 2. Lambda: Worker de Inventario (SQS Stock Queue -> Descuento atómico)
    // -------------------------------------------------------------------------
    this.stockWorkerFunction = new lambda.Function(
      this,
      "StockWorkerFunction",
      {
        functionName: `stock-sync-worker-${stage}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "index.stockHandler",
        code: lambda.Code.fromAsset("dist"),
        memorySize: 256,
        timeout: Duration.seconds(30),
        environment: {
          STAGE: stage,
          TABLE_NAME: props.invoicesTable.tableName,
        },
      },
    );

    // Event Source Mapping con ReportBatchItemFailures
    this.stockWorkerFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(props.stockUpdateQueue, {
        batchSize: 10,
        maxBatchingWindow: Duration.seconds(5), // Espera hasta 5s para agrupar mensajes
        reportBatchItemFailures: true, // ¡CRÍTICO! Evita reprocesar mensajes exitosos
      }),
    );

    props.invoicesTable.grantReadWriteData(this.stockWorkerFunction);

    // -------------------------------------------------------------------------
    // 3. Lambda: Worker de Auditoría con IA (SQS Audit Queue -> LangGraph + Phoenix)
    // -------------------------------------------------------------------------
    this.auditAgentWorkerFunction = new lambda.Function(
      this,
      "AuditAgentWorkerFunction",
      {
        functionName: `audit-agent-worker-${stage}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "index.auditHandler",
        code: lambda.Code.fromAsset("dist"),
        memorySize: 1024, // Mayor memoria (más vCPU) para llamadas a LLM y OpenTelemetry
        timeout: Duration.seconds(60),
        environment: {
          STAGE: stage,
          TABLE_NAME: props.invoicesTable.tableName,
          DOCUMENTS_BUCKET_NAME: props.documentsBucket.bucketName,
          // Configuración del Colector de Observabilidad Arize Phoenix
          PHOENIX_COLLECTOR_ENDPOINT: "http://localhost:6006/v1/traces",
        },
      },
    );

    // Event Source Mapping para el agente
    this.auditAgentWorkerFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(props.accountingAuditQueue, {
        batchSize: 5,
        maxBatchingWindow: Duration.seconds(10),
        reportBatchItemFailures: true,
      }),
    );

    // Permisos IAM de mínimo privilegio
    props.invoicesTable.grantReadData(this.auditAgentWorkerFunction);
    props.documentsBucket.grantReadWrite(this.auditAgentWorkerFunction);
  }
}
