import * as cdk from 'aws-cdk-lib';

export interface StageProps extends cdk.StageProps {
  subDomain: string;
}

export interface HostedZoneProps extends cdk.StackProps {
  stageName: string|undefined;
  subDomain:string;
  authDomain:string;
  businessDomain:string;
  apiDomain:string;
}

export interface DynamoStackProps extends cdk.StackProps {
  stageName: string|undefined;
}

export interface CustomEmailProps extends cdk.StackProps {
  stageName: string|undefined;
  authDomain:string;
}

export interface UserPoolStackProps extends cdk.StackProps {
  stageName: string|undefined;
  authDomain:string;
}

export interface ApiStackProps extends cdk.StackProps {
  stageName: string|undefined;
  subDomain:string;
  apiDomain:string;
}

export interface AmplifyStackProps extends cdk.StackProps {
  stageName: string|undefined;
}

export interface SSMStackProps extends cdk.StackProps {
  stageName: string|undefined;
}

export interface WebsiteStackProps extends cdk.StackProps {
  stageName: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  buildCommand: string;
  subDomain:string;
  authDomain:string;
}

export interface AppConfigStackProps extends cdk.StackProps {
  stageName: string | undefined;
}