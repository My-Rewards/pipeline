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

    const bucketName = `${props.stageName}-organization-assets`;

    const imageBucket = new s3.Bucket(this, "ImageBuckets", {
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        autoDeleteObjects: false,
        bucketName:bucketName,
        versioned:true,

    });

    const domainName = `${props.imageDomain}.${DOMAIN}`;
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
            fallbackOrigin: new cloudfrontOrigins.HttpOrigin(`${props.businessDomain}.${DOMAIN}`),
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
        recordName: props.imageDomain,
    });

    new cdk.CfnOutput(this, "CloudFrontURL", {
        value: distribution.distributionDomainName,
        exportName:'ImageCloudFrontURL'
    });

    new cdk.CfnOutput(this, "ImageDomain", {
        value: `${domainName}`,
        exportName:'ImageDomain'
    });

    new cdk.CfnOutput(this, "OrganizationImageBucket", {
        value: imageBucket.bucketName,
        exportName:'OrganizationImageBucket'
    });
  }
}
