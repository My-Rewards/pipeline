import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { AWS_BETA_ACCOUNT, AWS_PIPELINE_ACCOUNT, AWS_PROD_ACCOUNT, DOMAIN } from '../../global/constants';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ram from 'aws-cdk-lib/aws-ram';

export class HostedZoneStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    const hostedZone = new route53.HostedZone(this, 'HostedZone', {
      zoneName: DOMAIN,
    });

    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: DOMAIN,
      subjectAlternativeNames: [
        `www.${DOMAIN}`,
        `beta.${DOMAIN}`
      ],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    const nsRecord1 = ssm.StringParameter.fromStringParameterName(this, 'NsParameter1', `/myRewards/ns-record/beta/0`).stringValue;
    const nsRecord2 = ssm.StringParameter.fromStringParameterName(this, 'NsParameter2', `/myRewards/ns-record/beta/1`).stringValue;
    const nsRecord3 = ssm.StringParameter.fromStringParameterName(this, 'NsParameter3', `/myRewards/ns-record/beta/2`).stringValue;
    const nsRecord4 = ssm.StringParameter.fromStringParameterName(this, 'NsParameter4', `/myRewards/ns-record/beta/3`).stringValue;

    new route53.RecordSet(this, `UpdatedNSRecord-beta`, {
        zone: hostedZone,
        recordName: `beta.${DOMAIN}`,
        recordType: route53.RecordType.NS,
        target: route53.RecordTarget.fromValues(nsRecord1, nsRecord2, nsRecord3, nsRecord4),
        ttl: cdk.Duration.minutes(60),
        deleteExisting: true 
    }).applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);

    const nsRecord1p = ssm.StringParameter.fromStringParameterName(this, 'NsParameter1p', `/myRewards/ns-record/prod/0`).stringValue;
    const nsRecord2p = ssm.StringParameter.fromStringParameterName(this, 'NsParameter2p', `/myRewards/ns-record/prod/1`).stringValue;
    const nsRecord3p = ssm.StringParameter.fromStringParameterName(this, 'NsParameter3p', `/myRewards/ns-record/prod/2`).stringValue;
    const nsRecord4p = ssm.StringParameter.fromStringParameterName(this, 'NsParameter4p', `/myRewards/ns-record/prod/3`).stringValue;

    new route53.RecordSet(this, `UpdatedNSRecord-prod`, {
      zone: hostedZone,
      recordName: `www.${DOMAIN}`,
      recordType: route53.RecordType.NS,
      target: route53.RecordTarget.fromValues(nsRecord1p, nsRecord2p, nsRecord3p, nsRecord4p),
      ttl: cdk.Duration.minutes(60),
      deleteExisting: true 
    }).applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);

    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: hostedZone.hostedZoneId,
      description: 'The ID of the hosted zone',
      exportName: 'hostedZoneId'
    });

  }
}
