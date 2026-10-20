import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export interface MessagingStackProps extends StackProps {
  readonly stage?: string;
}

export class MessagingStack extends Stack {
  /**
   * Tópico SNS donde la Lambda principal publica los eventos (invoice.issued, invoice.cancelled).
   */
  public readonly invoiceEventsTopic: sns.Topic;

  /**
   * Cola SQS para el worker de Inventario (descuenta stock).
   */
  public readonly stockUpdateQueue: sqs.Queue;
  public readonly stockUpdateDlq: sqs.Queue;

  /**
   * Cola SQS para el Agente Auditor IA (LangGraph + MCP).
   */
  public readonly accountingAuditQueue: sqs.Queue;
  public readonly accountingAuditDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props?: MessagingStackProps) {
    super(scope, id, props);

    const isProd = props?.stage === "prod";
    const stage = props?.stage ?? "dev";

    // 1. Amazon SNS: Tópico Central de Eventos de Facturación (Fan-out Publisher)
    this.invoiceEventsTopic = new sns.Topic(this, "InvoiceEventsTopic", {
      topicName: `invoice-events-${stage}`,
      displayName: "Facturación y Eventos de Dominio Contable",
    });

    // -------------------------------------------------------------------------
    // 2. Consumidor A: Worker de Inventario (Stock Sync)
    // -------------------------------------------------------------------------
    // Dead Letter Queue (DLQ) para aislar mensajes fallidos tras 3 reintentos
    this.stockUpdateDlq = new sqs.Queue(this, "StockUpdateDlq", {
      queueName: `stock-update-dlq-${stage}`,
      retentionPeriod: Duration.days(14), // Máxima retención permitida por AWS
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // Cola principal de Inventario
    this.stockUpdateQueue = new sqs.Queue(this, "StockUpdateQueue", {
      queueName: `stock-update-queue-${stage}`,
      visibilityTimeout: Duration.seconds(30), // Tiempo que el worker tiene para procesar el lote
      deadLetterQueue: {
        queue: this.stockUpdateDlq,
        maxReceiveCount: 3, // Si falla 3 veces consecutivas, se envía a la DLQ
      },
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // Suscripción SNS -> SQS (Fan-out)
    this.invoiceEventsTopic.addSubscription(
      new snsSubscriptions.SqsSubscription(this.stockUpdateQueue, {
        rawMessageDelivery: false, // Envía metadatos SNS útiles para trazabilidad
      }),
    );

    // -------------------------------------------------------------------------
    // 3. Consumidor B: Worker de Auditoría con IA (LangGraph + Phoenix + MCP)
    // -------------------------------------------------------------------------
    // DLQ para auditoría
    this.accountingAuditDlq = new sqs.Queue(this, "AccountingAuditDlq", {
      queueName: `accounting-audit-dlq-${stage}`,
      retentionPeriod: Duration.days(14),
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // Cola principal de Auditoría
    this.accountingAuditQueue = new sqs.Queue(this, "AccountingAuditQueue", {
      queueName: `accounting-audit-queue-${stage}`,
      visibilityTimeout: Duration.seconds(60), // Mayor timeout porque invoca al agente de IA
      deadLetterQueue: {
        queue: this.accountingAuditDlq,
        maxReceiveCount: 3,
      },
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // Suscripción SNS -> SQS (Fan-out)
    this.invoiceEventsTopic.addSubscription(
      new snsSubscriptions.SqsSubscription(this.accountingAuditQueue, {
        rawMessageDelivery: false,
      }),
    );
  }
}
