import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_dynamodb } from 'aws-cdk-lib';
import { GenericStackProps } from '../../global/props';

export class DynamoStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: GenericStackProps) {
    super(scope, id, props);

    const isProd = props.stageName === 'prod';

    // users Table
    const userTable = new aws_dynamodb.Table(this, 'App-Users-Table', {
      tableName: `App-Users-${props.stageName}`,
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
      tableName: `Business-Users-${props.stageName}`,
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
      partitionKey: { name: "org_id", type: aws_dynamodb.AttributeType.STRING },
      projectionType: aws_dynamodb.ProjectionType.ALL,
    });

    // Organizations Table
    const organizationTable = new aws_dynamodb.Table(this, 'Organizations-Table', {
      tableName: `Organizations-${props.stageName}`,
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      deletionProtection:isProd
    });
    organizationTable.addGlobalSecondaryIndex({
      indexName: "name-index",
      partitionKey: { name: "search_name", type: aws_dynamodb.AttributeType.STRING },
      projectionType: aws_dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ["id", "name"]
    });

    // shops Table
    const shopTable = new aws_dynamodb.Table(this, 'Shops-Table', {
      tableName: `Shops-${props.stageName}`,
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
      partitionKey: { name: "org_id", type: aws_dynamodb.AttributeType.STRING },
      projectionType: aws_dynamodb.ProjectionType.ALL,
    });
    shopTable.addGlobalSecondaryIndex({
      indexName: "SquareIndex",
      partitionKey: { name: "square_location_id", type: aws_dynamodb.AttributeType.STRING },
      projectionType: aws_dynamodb.ProjectionType.ALL,
    });

    // plans Table
    const planTable = new aws_dynamodb.Table(this, 'Plans-Table', {
      tableName: `Plans-${props.stageName}`,
      partitionKey: { name: 'user_id', type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'org_id', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      deletionProtection: isProd
    });
    planTable.addGlobalSecondaryIndex({
      indexName: 'byOrg',
      partitionKey: { name: 'org_id', type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'updated_at', type: aws_dynamodb.AttributeType.STRING },
      projectionType: aws_dynamodb.ProjectionType.ALL
    });
    planTable.addGlobalSecondaryIndex({
      indexName: 'byPlanId',
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING },
      projectionType: aws_dynamodb.ProjectionType.ALL
    });

    // visits Table
    const visitTable = new aws_dynamodb.Table(this, 'Visits-Table', {
      tableName: `Visits-${props.stageName}`,
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:cdk.RemovalPolicy.RETAIN,
      deletionProtection:isProd
    });

    // Rewards Table
    const rewardsTable = new aws_dynamodb.Table(this, 'Rewards-Table', {
      tableName: `Rewards-${props.stageName}`,
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: isProd
    });
    rewardsTable.addGlobalSecondaryIndex({
      indexName: "PlanIndex",
      partitionKey: { name: "plan_id", type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: "updated_on", type: aws_dynamodb.AttributeType.STRING },
      projectionType: aws_dynamodb.ProjectionType.ALL,
    });
    rewardsTable.addGlobalSecondaryIndex({
      indexName: "activeRewardsIndex",
      partitionKey: { name: "plan_id", type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: "active", type: aws_dynamodb.AttributeType.NUMBER },
      projectionType: aws_dynamodb.ProjectionType.ALL,
    });
    rewardsTable.addGlobalSecondaryIndex({
      indexName: "UserIndex",
      partitionKey: { name: "user_id", type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: "redeemed_on", type: aws_dynamodb.AttributeType.STRING },
      projectionType: aws_dynamodb.ProjectionType.ALL,
    });
    rewardsTable.addGlobalSecondaryIndex({
      indexName: "RewardPlanIndex",
      partitionKey: { name: "reward_id", type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: "plan_id", type: aws_dynamodb.AttributeType.STRING },
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

    new cdk.CfnOutput(this, 'RewardsTableARN', {
      value: rewardsTable.tableArn,
      description: 'The Likes Table ARN',
      exportName: 'RewardsTableARN',
    });
  }
}
