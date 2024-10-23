import * as cdk from 'aws-cdk-lib';
import { ApiGatewayStack } from '../lib/Stacks/apiGateway-stack';
import { DynamoStack } from '../lib/Stacks/dynamo-stack';

export interface stackProps extends cdk.StackProps {
  stageName: string|undefined;
}
