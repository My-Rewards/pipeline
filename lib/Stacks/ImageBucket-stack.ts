import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from "aws-cdk-lib/aws-route53";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";
import { ImageBucketProps } from "../../global/props";
import { DOMAIN } from "../../global/constants";
import * as targets from 'aws-cdk-lib/aws-route53-targets';

export class ImageBucketStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ImageBucketProps) {
    super(scope, id, props);

    const bucketName = `${props.stageName}-organization-assets`;

    const imageBucket = new s3.Bucket(this, "ImageBuckets", {
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        autoDeleteObjects: false,
        bucketName: bucketName,
        versioned: true,
        publicReadAccess: true,
        blockPublicAccess: new s3.BlockPublicAccess({
            blockPublicAcls: false,
            blockPublicPolicy: false,
            ignorePublicAcls: false,
            restrictPublicBuckets: false
        }),
        cors: [
            {
                allowedMethods: [
                    s3.HttpMethods.GET,
                    s3.HttpMethods.PUT,
                    s3.HttpMethods.POST,
                    s3.HttpMethods.DELETE
                ],
                allowedOrigins: ["*"],
                allowedHeaders: ["*"],
                exposedHeaders: ["ETag"],
                maxAge: 3000,
            },
        ],
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

    const oac = new cloudfront.CfnOriginAccessControl(this, "OAC", {
        originAccessControlConfig: {
          name: "ImageBucketOAC",
          originAccessControlOriginType: "s3",
          signingBehavior: "always",
          signingProtocol: "sigv4",
        },
    });
      
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(imageBucket, {
        originAccessLevels: [cloudfront.AccessLevel.READ, cloudfront.AccessLevel.LIST],
      });

    const distribution = new cloudfront.Distribution(this, "myDist", {
        defaultBehavior: {
            origin: s3Origin,
            compress: true,
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD
        },
        defaultRootObject: "", 
        domainNames: [domainName],
        comment: DOMAIN,
        certificate,
        httpVersion: cloudfront.HttpVersion.HTTP2,
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        
    });

    const cfnDistribution = distribution.node.defaultChild as cloudfront.CfnDistribution;
    cfnDistribution.addPropertyOverride("DistributionConfig.Origins.0.OriginAccessControlId", oac.attrId);
    
    new route53.ARecord(this, `${props.stageName}AliasRecord`, {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      deleteExisting:true
    }).applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);


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

    new cdk.CfnOutput(this, "OrganizationImageBucketARN", {
        value: imageBucket.bucketArn,
        exportName:'OrganizationImageBucketARN'
    });
  }
}
