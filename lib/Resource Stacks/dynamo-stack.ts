import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_dynamodb } from 'aws-cdk-lib';
import { stackProps } from '../../global/props';

export class DynamoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: stackProps) {
    super(scope, id, props);

    const usersTable = new aws_dynamodb.Table(this, 'UsersTable', {
      partitionKey: { name: 'userId', type: aws_dynamodb.AttributeType.STRING }, 
      tableName: 'Users',
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
