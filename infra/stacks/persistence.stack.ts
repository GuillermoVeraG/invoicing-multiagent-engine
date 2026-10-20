import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface PersistenceStackProps extends StackProps {
  readonly stage?: string;
}

export class PersistenceStack extends Stack {
  public readonly invoicesTable: dynamodb.Table;
  public readonly documentsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: PersistenceStackProps) {
    super(scope, id, props);

    const isProd = props?.stage === "prod";

    // 1. DynamoDB: Single-Table Design para Invoicing Core
    const table = new dynamodb.Table(this, "InvoicesTable", {
      tableName: `invoices-${props?.stage ?? "dev"}`,
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // GSI1: Consulta por cliente y rango de fecha
    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: {
        name: "GSI1PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI1SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.invoicesTable = table;

    // 2. Amazon S3: Almacén inmutable de facturas y balances fiscales
    const bucket = new s3.Bucket(this, "InvoicesDocumentsBucket", {
      bucketName: `invoicing-docs-${this.account}-${this.region}-${props?.stage ?? "dev"}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: Duration.days(90),
            },
          ],
        },
      ],
    });

    this.documentsBucket = bucket;
  }
}
