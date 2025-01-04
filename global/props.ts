import * as cdk from 'aws-cdk-lib';

export interface StackProps extends cdk.StackProps {
  stageName: string|undefined;
  subDomain:string;
  authDomain:string;
  authDomainBusiness:string;
  businessDomain:string;
  apiDomain:string;
}

export interface StageProps extends cdk.StageProps {
  subDomain: string;
}

export interface WebsiteStackProps extends cdk.StackProps {
  stageName: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  buildCommand: string;
  subDomain:string;
  authDomain:string;
  authDomainBusiness:string;
}