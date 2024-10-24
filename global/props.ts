import * as cdk from 'aws-cdk-lib';

export interface stackProps extends cdk.StackProps {
  stageName: string|undefined;
}