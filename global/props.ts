import * as cdk from 'aws-cdk-lib';

export interface StageProps extends cdk.StageProps {
  subDomain: string;
}

export interface HostedZoneProps extends cdk.StackProps {
  stageName: string;
  subDomain:string;
  authDomain:string;
  businessDomain:string;
  apiDomain:string;
  imageDomain:string;
}

export interface DynamoStackProps extends cdk.StackProps {
  stageName: string;
}

export interface AuroraStackProps extends cdk.StackProps {
  stageName: string;
}

export interface VpcStackProps extends cdk.StackProps {
  stageName: string;
}

export interface CustomEmailProps extends cdk.StackProps {
  stageName: string;
  authDomain:string;
}

export interface UserPoolStackProps extends cdk.StackProps {
  stageName: string;
  authDomain:string;
  businessDomain:string;
}

export interface ApiStackProps extends cdk.StackProps {
  stageName: string;
  subDomain:string;
  apiDomain:string;
}

export interface AmplifyStackProps extends cdk.StackProps {
  stageName: string;
}

export interface SSMStackProps extends cdk.StackProps {
  stageName: string;
}

export interface AppConfigStackProps extends cdk.StackProps {
  stageName: string;
}

export interface CloudWatchStackProps extends cdk.StackProps {
  stageName: string;
}

export interface ImageBucketProps extends cdk.StackProps {
  stageName: string;
  imageDomain: string;
  businessDomain: string;
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

export interface BusinessWebsiteStackProps extends cdk.StackProps {
  stageName: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  buildCommand: string;
  subDomain:string;
  apiDomain:string;
}

export interface AmplifyHostingStackProps extends cdk.StackProps {
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  githubOauthTokenName: string;
  userPoolId: string;
  userPoolClientId: string;
  apiUrl: string;
  stripePublicKey: string;
}

export interface AmplifyHostingStackProps extends cdk.StackProps {
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  githubOauthTokenName: string;
  userPoolId: string;
  userPoolClientId: string;
  apiUrl: string;
  stripePublicKey: string;
}
