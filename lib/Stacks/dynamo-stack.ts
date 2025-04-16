import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_dynamodb } from 'aws-cdk-lib';
import { DynamoStackProps } from '../../global/props';

export class DynamoStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: DynamoStackProps) {
    super(scope, id, props);

    const isProd = props.stageName === 'prod';

    // users Table
    const userTable = new aws_dynamodb.Table(this, 'App-Users-Table', {
      tableName: `${props.stageName}-App-Users`,
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      deletionProtection:isProd
    });

    // business users Table
    const businessUserTable = new aws_dynamodb.Table(this, 'Business-Users-Table', {
      tableName: `${props.stageName}-Business-Users`,
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      deletionProtection:isProd
    });
    businessUserTable.addGlobalSecondaryIndex({
      indexName: "OrgIndex",
      partitionKey: { name: "orgId", type: aws_dynamodb.AttributeType.STRING },
      projectionType: aws_dynamodb.ProjectionType.ALL,
    });

    // Organizations Table
    const organizationTable = new aws_dynamodb.Table(this, 'Organizations-Table', {
      tableName: `${props.stageName}-Organizations`,
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      deletionProtection:isProd
    });

    // shops Table
    const shopTable = new aws_dynamodb.Table(this, 'Shops-Table', {
      tableName: `${props.stageName}-App-Shops`,
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      deletionProtection:isProd
    });
    shopTable.addGlobalSecondaryIndex({
      indexName: "OrgIndex",
      partitionKey: { name: "orgId", type: aws_dynamodb.AttributeType.STRING },
      projectionType: aws_dynamodb.ProjectionType.ALL,
    });

    // plans Table
    const planTable = new aws_dynamodb.Table(this, 'Plans-Table', {
      tableName: `${props.stageName}-Plans`,
      partitionKey: { name: 'userId', type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'updatedAt', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      deletionProtection: isProd
    });
    planTable.addGlobalSecondaryIndex({
      indexName: 'orgId-index',
      partitionKey: { name: 'orgId', type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'updatedAt', type: aws_dynamodb.AttributeType.STRING },
    });
    planTable.addGlobalSecondaryIndex({
      indexName: 'Plan_id',
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING },
    });


    // visits Table
    const visitTable = new aws_dynamodb.Table(this, 'Visits-Table', {
      tableName: `${props.stageName}-Visits`,
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:cdk.RemovalPolicy.RETAIN,
      deletionProtection:isProd
    });
    visitTable.addGlobalSecondaryIndex({
      indexName: 'user_id',
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING },
    });
    visitTable.addGlobalSecondaryIndex({
      indexName: 'org_id',
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING },
    });

    // Likes Table
    const likesTable = new aws_dynamodb.Table(this, 'Likes-Table', {
      tableName: `${props.stageName}-Likes`,
      partitionKey: { name: 'userId', type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'shopId', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:cdk.RemovalPolicy.RETAIN,
      deletionProtection: isProd
    });
    likesTable.addGlobalSecondaryIndex({
      indexName: 'ShopLikes',
      partitionKey: { name: 'shopId', type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: aws_dynamodb.AttributeType.STRING },
    });


    // Rewards Table
    const rewardsTable = new aws_dynamodb.Table(this, 'Rewards-Table', {
      tableName: `${props.stageName}-Rewards`,
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      deletionProtection:isProd
    });

    new cdk.CfnOutput(this, 'OrganizationTableARN', {
      value: organizationTable.tableArn,
      description: 'The Organization Table ARN',
      exportName: 'OrganizationTableARN',
    });

    new cdk.CfnOutput(this, 'UserTableARN', {
      value: userTable.tableArn,
      description: 'The Customer Users Table ARN',
      exportName: 'UserTableARN',
    });

    new cdk.CfnOutput(this, 'BizzUserTableARN', {
      value: businessUserTable.tableArn,
      description: 'The Business Users Table ARN',
      exportName: 'BizzUserTableARN',
    });

    new cdk.CfnOutput(this, 'ShopTableARN', {
      value: shopTable.tableArn,
      description: 'The Shop Table ARN',
      exportName: 'ShopTableARN',
    });

    new cdk.CfnOutput(this, 'PlanTableARN', {
      value: planTable.tableArn,
      description: 'The Plan Table ARN',
      exportName: 'PlanTableARN',
    });

    new cdk.CfnOutput(this, 'VisitTableARN', {
      value: visitTable.tableArn,
      description: 'The Visit Table ARN',
      exportName: 'VisitTableARN',
    });

    new cdk.CfnOutput(this, 'LikesTableARN', {
      value: likesTable.tableArn,
      description: 'The Likes Table ARN',
      exportName: 'LikesTableARN',
    });

    new cdk.CfnOutput(this, 'RewardsTableARN', {
      value: rewardsTable.tableArn,
      description: 'The Likes Table ARN',
      exportName: 'RewardsTableARN',
    });
  }
}
