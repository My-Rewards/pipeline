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
 * @returns An object containing the VPC, cluster secret, cluster ARN, cluster role, and security group
 */
export function getAuroraAccess(scope: Construct, id: string): InfrastructureResources {
  const vpc = ec2.Vpc.fromVpcAttributes(scope, `${id}ImportedVPC`, {
    vpcId: cdk.Fn.importValue("ClusterVPC-Id"),
    availabilityZones: cdk.Fn.getAzs(),
    vpcCidrBlock: "10.0.0.0/24",
    privateSubnetIds: [
      cdk.Fn.importValue("PrivateSubnetWithEgress1-Id"),
      cdk.Fn.importValue("PrivateSubnetWithEgress2-Id"),
    ],
    privateSubnetNames: ["Private1", "Private2"],
    publicSubnetIds: [
      cdk.Fn.importValue("PublicSubnet1-Id"),
      cdk.Fn.importValue("PublicSubnet2-Id"),
    ],
    publicSubnetNames: ["Public1", "Public2"],
    isolatedSubnetIds: [
      cdk.Fn.importValue("PrivateSubnet1-Id"),
      cdk.Fn.importValue("PrivateSubnet2-Id"),
    ],
    isolatedSubnetNames: ["Isolated1", "Isolated2"],
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