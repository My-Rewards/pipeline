import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { ORGANIZATION, DOMAIN, AWS_CENTRAL_ACCOUNT, AWS_BETA_ACCOUNT, AWS_PROD_ACCOUNT } from '../../global/constants';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ram from 'aws-cdk-lib/aws-ram';

export class HostedZoneStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    const delegationRole = new iam.Role(this, 'DelegationRole', {
      assumedBy: new iam.CompositePrincipal(
        new iam.AccountPrincipal(AWS_BETA_ACCOUNT),
        new iam.AccountPrincipal(AWS_CENTRAL_ACCOUNT)
      ),
      roleName: 'ParentZoneDelegationRole',
      description: 'Role for delegating DNS management to child accounts',
    });

    delegationRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'route53:ChangeResourceRecordSets',
        'route53:ListResourceRecordSets',
        'route53:GetHostedZone',
      ],
      resources: ['*'],
    }));

    const hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
      zoneName: DOMAIN,
      crossAccountZoneDelegationPrincipal: new iam.OrganizationPrincipal(ORGANIZATION)
    });

    new acm.Certificate(this, 'Certificate', {
      domainName: DOMAIN,
      subjectAlternativeNames: [
        `*.${DOMAIN}`,
      ],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    const sharedParameter1 = new ssm.StringParameter(this,`centralHostedZoneARN`, {
      parameterName: `/myRewards/hostedZoneARN`,
      stringValue: delegationRole.roleArn,
      description: 'Centralized cross-account shared parameter for latest golden Linux AMI',
      tier: ssm.ParameterTier.ADVANCED,
    });

    const sharedParameter2 = new ssm.StringParameter(this,`centralHostedZoneID`, {
      parameterName: `/myRewards/hostedZoneID`,
      stringValue: hostedZone.hostedZoneId,
      description: 'Centralized cross-account shared parameter for latest golden Linux AMI',
      tier: ssm.ParameterTier.ADVANCED,
    });

    new ram.CfnResourceShare(this, `RAMShareARN`, {
      name: 'centralHostedZoneARN',
      allowExternalPrincipals: false,
      resourceArns: [sharedParameter1.parameterArn],
      principals: [AWS_BETA_ACCOUNT, AWS_PROD_ACCOUNT],
      tags: [
        { key: 'EnvironmentType', value: 'central' },
        { key: 'Owner', value: 'MyRewardsTeam' },
      ],
    });

    new ram.CfnResourceShare(this, `RAMShareID`, {
      name: 'centralHostedZoneID',
      allowExternalPrincipals: false,
      resourceArns: [sharedParameter2.parameterArn],
      principals: [AWS_BETA_ACCOUNT, AWS_PROD_ACCOUNT],
      tags: [
        { key: 'EnvironmentType', value: 'central' },
        { key: 'Owner', value: 'MyRewardsTeam' },
      ],
    });

    new cdk.CfnOutput(this, 'CentralHostedZoneID', {
      value: hostedZone.hostedZoneId,
      description: 'CloudFront Distribution Domain Name',
      exportName: `CentralHostedZoneID`,
    });
  }
}
