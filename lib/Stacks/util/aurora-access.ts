import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * Interface for the return value of getInfrastructureResources function
 */
export interface InfrastructureResources {
  vpc: ec2.IVpc;
  clusterSecret: cdk.aws_secretsmanager.ISecret;
  clusterArn: string;
  clusterRole: iam.IRole;
  securityGroupResolvers: ec2.ISecurityGroup;
}

/**
 * Helper function to retrieve common infrastructure resources
 * @param scope The construct scope
 * @param id A unique identifier for the resources
 * @param stageName
 * @returns An object containing the VPC, cluster secret, cluster ARN, cluster role, and security group
 */
export function getAuroraAccess(scope: Construct, id: string, stageName:string): InfrastructureResources {

  const vpc = ec2.Vpc.fromLookup(scope, `${id}Vpc`, {
    tags: { Name: `aurora-vpc-${stageName}` },
  });

  const clusterSecret = cdk.aws_secretsmanager.Secret.fromSecretCompleteArn(
    scope,
    `${id}AuroraSecret`,
    cdk.Fn.importValue('AuroraSecretARN')
  );

  const clusterArn = cdk.Fn.importValue('ClusterARN');

  const clusterRole = iam.Role.fromRoleArn(
    scope,
    `${id}ImportedRole`,
    cdk.Fn.importValue("ClusterRoleARN")
  );

  const securityGroupResolvers = ec2.SecurityGroup.fromSecurityGroupId(
    scope,
    `${id}ImportedSecurityGroupResolvers`,
    cdk.Fn.importValue("SecurityGroupResolversId"),
    { allowAllOutbound: true }
  );

  return {
    vpc,
    clusterSecret,
    clusterArn,
    clusterRole,
    securityGroupResolvers
  };
}