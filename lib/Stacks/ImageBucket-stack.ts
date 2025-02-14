import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfrontOrigins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";
import { ImageBucketProps } from "../../global/props";
import { DOMAIN } from "../../global/constants";

export class ImageBucketStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ImageBucketProps) {
    super(scope, id, props);

    const imageBucket = new s3.Bucket(this, "ImageBuckets", {
        removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
        autoDeleteObjects: false,
    });

    const domainName = `${props?.subDomain}.${DOMAIN}`;
    const hostedZoneId = cdk.Fn.importValue(`${props.stageName}-Image-HostedZoneId`);

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZoneAuth', {
        hostedZoneId: hostedZoneId,
        zoneName: domainName,
    });

    const certificate = new certificatemanager.Certificate(this, "Certificate", {
        domainName,
        validation: certificatemanager.CertificateValidation.fromDns(hostedZone),
    });

    const distribution = new cloudfront.Distribution(this, 'myDist', {
        defaultBehavior: {
            origin: new cloudfrontOrigins.OriginGroup({
            primaryOrigin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(imageBucket),
            fallbackOrigin: new cloudfrontOrigins.HttpOrigin('www.myrewards.website'),
            fallbackStatusCodes: [404],
            }),
        },
        domainNames: [domainName],
        certificate,
    });
      
    new route53.ARecord(this, "AliasRecord", {
        zone: hostedZone,
        target: route53.RecordTarget.fromAlias(
            new route53Targets.CloudFrontTarget(distribution)
        ),
        recordName: props.subDomain,
    });

    new cdk.CfnOutput(this, "CloudFrontURL", {
        value: distribution.distributionDomainName,
    });

    new cdk.CfnOutput(this, "CustomDomain", {
        value: `https://${domainName}`,
    });
  }
}
