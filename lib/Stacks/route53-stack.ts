import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { stackProps } from '../../global/props';
import { DOMAIN_NAME } from '../../global/constants';

export class Route53Stack extends cdk.Stack {
  public readonly hostedZone: route53.IHostedZone;

  constructor(scope: Construct, id: string, props: stackProps) {
    super(scope, id, props);

    // Register a new domain using Route 53
    // TBD on whether this is possible via cdk

    // Create Route 53 Hosted Zone
    this.hostedZone = new route53.HostedZone(this, 'HostedZone', {
      zoneName: `${DOMAIN_NAME}.com`,
    });

    // Output the domain and hosted zone ID
    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description: 'Hosted Zone ID for your domain',
    });

    new cdk.CfnOutput(this, 'DomainName', {
      value: `${DOMAIN_NAME}.com`,
      description: 'The domain name registered via Route 53',
    });
  }
}
