import * as cdk from 'aws-cdk-lib';
import { ApiGatewayStack } from '../lib/Resource Stacks/apiGateway-stack';
import { DynamoStack } from '../lib/Resource Stacks/dynamo-stack';

export interface stackProps extends cdk.StackProps {
  stageName: string|undefined;
  database?: DynamoStack
  api?:ApiGatewayStack
}
