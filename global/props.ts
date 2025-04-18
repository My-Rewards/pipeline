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

export interface GenericStackProps extends cdk.StackProps {
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