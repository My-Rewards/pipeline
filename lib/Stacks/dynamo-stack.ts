import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_dynamodb } from 'aws-cdk-lib';
import { DynamoStackProps } from '../../global/props';

export class DynamoStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: DynamoStackProps) {
    super(scope, id, props);

    // users Table
     const userTable = new aws_dynamodb.Table(this, 'UsersTable', {
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING }, 
      tableName: `Users`,
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });
    userTable.addGlobalSecondaryIndex({
      indexName: "OrgIndex",
      partitionKey: { name: "org_id", type: aws_dynamodb.AttributeType.STRING },
      projectionType: aws_dynamodb.ProjectionType.ALL, 
    });

    // business Table
    const organizationTable = new aws_dynamodb.Table(this, 'OrganizationTable', {
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING }, 
      tableName: `Organizations`,
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });

    // shops Table
    const shopTable = new aws_dynamodb.Table(this, 'ShopTable', {
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING }, 
      tableName: `Shops`,
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });
    shopTable.addGlobalSecondaryIndex({
      indexName: "OrgIndex",
      partitionKey: { name: "org_id", type: aws_dynamodb.AttributeType.STRING },
      projectionType: aws_dynamodb.ProjectionType.ALL,
    });

    // plans Table
    const planTable = new aws_dynamodb.Table(this, 'PlanTable', {
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING }, 
      tableName: `Plans`,
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });

    // visits Table
    const visitTable = new aws_dynamodb.Table(this, 'VisitTable', {
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING }, 
      tableName: `Visits`,
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });

    // Visit Table
    const likesTable = new aws_dynamodb.Table(this, 'LikesTable', {
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING }, 
      tableName: `Likes`,
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });


    new cdk.CfnOutput(this, 'OrganizationTableARN', {
      value: organizationTable.tableArn,
      description: 'The Organization Table ARN',
      exportName: 'OrganizationTableARN',
    });
    
    new cdk.CfnOutput(this, 'UserTableARN', {
      value: userTable.tableArn,
      description: 'The Users Table ARN',
      exportName: 'UserTableARN',
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
    
  }
}
