import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { WebsiteStackProps } from '../../global/props';
import { DOMAIN } from '../../global/constants';
import { BucketAccessControl } from 'aws-cdk-lib/aws-s3';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as custom from 'aws-cdk-lib/custom-resources';

export class WebsiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WebsiteStackProps) {
    super(scope, id, props);

    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `${DOMAIN}-${props.stageName}-assets`,
      versioned: true,
      accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      })
    });

    const bucketPolicy = new s3.BucketPolicy(this, 'BucketPolicy', {
      bucket: websiteBucket,
    });

    bucketPolicy.document.addStatements(
      new iam.PolicyStatement({
        sid: 'PublicReadGetObject', 
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:GetObject'],
        resources: [`${websiteBucket.bucketArn}/*`],
      })
    );

    // CodeBuild + Auto Build Trigger
    const codeBuildRole = new iam.Role(this, 'WebsiteBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeBuildAdminAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess')
      ],
      inlinePolicies: {
        'github-access': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'codecommit:GetBranch',
                'codecommit:GetCommit',
                'codecommit:GetRepository',
                'codecommit:ListRepositories',
                's3:GetObject',
                's3:PutObject',
                's3:GetBucketLocation',
                'secretsmanager:GetSecretValue'
              ],
              resources: ['*'],
            })
          ]
        })
      }
    });

    new codebuild.GitHubSourceCredentials(this, 'CodeBuildGitHubCreds', {
      accessToken: cdk.SecretValue.secretsManager('github-token'),
    });

    const buildProject = new codebuild.Project(this, 'WebsiteBuildProject', {
      role: codeBuildRole,
      source: codebuild.Source.gitHub({
        owner: props.githubOwner,
        repo: props.githubRepo,
        branchOrRef: props.githubBranch,
        reportBuildStatus: true,
        webhook: true,
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH)
            .andBranchIs(props.githubBranch),
        ],
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '22',
            },
            commands: [
              'npm install',
            ],
          },
          build: {
            commands: [
              props.buildCommand,     
            ],
          }
        },
        artifacts: {
          files: [`**/*`],
          'base-directory': 'dist',
          name:'',
        },
      }),
      artifacts: codebuild.Artifacts.s3({
        bucket: websiteBucket,
        includeBuildId: false,
        packageZip: false,
        name:'/',
        encryption:false
      })
    });

    const s3origin = new origins.S3StaticWebsiteOrigin(websiteBucket);

    const hostedZoneId = cdk.Fn.importValue(`${props.stageName}-HostedZoneId`);

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: hostedZoneId,
      zoneName: `${props.subDomain}.${DOMAIN}`,
    });

    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName:`${props.subDomain}.${DOMAIN}`,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // CloudFront
    const distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      defaultRootObject: `index.html`,
      comment: DOMAIN,
      certificate:certificate,
      domainNames: [`${props.subDomain}.${DOMAIN}`],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: s3origin,
        compress: true,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath:`/index.html`,
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath:`/index.html`,
        }
      ],
    });
    
    new route53.ARecord(this, `${props.stageName}AliasRecord`, {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      deleteExisting:true
    }).applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);

    new cdk.CfnOutput(this, 'WebsiteBucketName', {
      value: websiteBucket.bucketName,
      description: 'Website S3 Bucket Name',
      exportName: `${props.stageName}-WebsiteBucketName`,
    });

    new cdk.CfnOutput(this, 'WebsiteDistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `${props.stageName}-WebsiteDistributionId`,
    });

    new cdk.CfnOutput(this, 'WebsiteCloudfrontDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name',
      exportName: `${props.stageName}-WebsiteCloudfrontDomainName`,
    });

    cdk.Tags.of(this).add('Stage', props.stageName);
    cdk.Tags.of(this).add('Project', 'Website');
  }
}