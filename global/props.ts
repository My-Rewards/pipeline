import * as cdk from 'aws-cdk-lib';
import { ApiGatewayStack } from '../lib/Stacks/apiGateway-stack';
import { DynamoStack } from '../lib/Stacks/dynamo-stack';

export interface stackProps extends cdk.StackProps {
  stageName: string|undefined;
  database?: DynamoStack
  api?:ApiGatewayStack
  domainName?: string
}

export interface amplifyProps extends cdk.StackProps {
  stageName: string|undefined;
  authenticatedRole:cdk.aws_iam.Role
}

export interface apiProps extends cdk.StackProps {
  stageName: string|undefined;
  userPool: cdk.aws_cognito.UserPool
  authenticatedRole:cdk.aws_iam.Role
  database: DynamoStack

}

