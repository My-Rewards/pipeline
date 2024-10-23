import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_dynamodb } from 'aws-cdk-lib';
import { stackProps } from '../../global/props';

export class DynamoStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: stackProps) {
    super(scope, id, props);

    // users Table
     const usersTable = new aws_dynamodb.Table(this, 'UsersTable', {
      partitionKey: { name: 'userId', type: aws_dynamodb.AttributeType.STRING }, 
      tableName: 'Users',
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // business Table
    const businessTable = new aws_dynamodb.Table(this, 'BusinessTable', {
      partitionKey: { name: 'id', type: aws_dynamodb.AttributeType.STRING }, 
      tableName: "Organizations",
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.CfnOutput(this, 'OrganizationTableARN', {
      value: usersTable.tableArn,
      description: 'The Organization Table ARN',
      exportName:'OrganizationTableARN'
    });

    new cdk.CfnOutput(this, 'UserTableARN', {
      value: usersTable.tableArn,
      description: 'The Users Table ARN',
      exportName:'UserTableARN'
    });
  }
}
