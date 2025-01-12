import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { BusinessWebsiteStackProps } from '../../global/props';
import { DOMAIN } from '../../global/constants';
import { BucketAccessControl } from 'aws-cdk-lib/aws-s3';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as custom from 'aws-cdk-lib/custom-resources';

export class BusinessWebsiteStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: BusinessWebsiteStackProps) {
        super(scope, id, props);

        // S3 Bucket for Website Assets
        const websiteBucket = new s3.Bucket(this, 'BusinessWebsiteBucket', {
            bucketName: `${DOMAIN}-${props.stageName}-business-assets`,
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
            }),
        });

        // Bucket Policy
        const bucketPolicy = new s3.BucketPolicy(this, 'BusinessBucketPolicy', {
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

        // CodeBuild Configuration
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


        // new codebuild.GitHubSourceCredentials(this, 'BusinessCodeBuildGitHubCreds', {
        //     accessToken: cdk.SecretValue.secretsManager('github-token'),
        // });

        const buildProject = new codebuild.Project(this, 'BusinessWebsiteBuildProject', {
            role: codeBuildRole,
            source: codebuild.Source.gitHub({
                owner: props.githubOwner,
                repo: props.githubRepo,
                branchOrRef: props.githubBranch,
                reportBuildStatus: true,
                webhook: true,
                webhookFilters: [
                    codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH).andBranchIs(props.githubBranch),
                ],
            }),
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
                computeType: codebuild.ComputeType.SMALL,
                // environmentVariables: {
                //     USER_POOL_ID: { value: props.userPoolId },
                //     USER_POOL_CLIENT_ID: { value: props.userPoolClientId },
                // },
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        'runtime-versions': {
                            nodejs: '22',
                        },
                        commands: ['npm install'],
                    },
                    build: {
                        commands: [props.buildCommand],
                    },
                },
                artifacts: {
                    name: '',
                    files: ['**/*'],
                    'base-directory': 'build',
                },
            }),
            artifacts: codebuild.Artifacts.s3({
                bucket: websiteBucket,
                name: '/',
                includeBuildId: false,
                packageZip: false,
                encryption: false
            }),
        });

        const triggerBuildFunction = new lambda.Function(this, 'TriggerBuildFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const codebuild = new AWS.CodeBuild();
        exports.handler = async (event) => {
          console.log('Triggering CodeBuild Project...');
          const response = await codebuild.startBuild({ projectName: '${buildProject.projectName}' }).promise();
          console.log('CodeBuild Response:', response);
          return { PhysicalResourceId: response.build.id };
        };
      `),
            initialPolicy: [
                new iam.PolicyStatement({
                    actions: ['codebuild:StartBuild'],
                    resources: [buildProject.projectArn],
                }),
            ],
        });

        const triggerInitialBuild = new custom.AwsCustomResource(this, 'TriggerInitialBuild', {
            onCreate: {
                service: 'Lambda',
                action: 'invoke',
                parameters: {
                    FunctionName: triggerBuildFunction.functionName,
                    InvocationType: 'RequestResponse'
                },
                physicalResourceId: custom.PhysicalResourceId.of('TriggerInitialBuild')
            },
            policy: custom.AwsCustomResourcePolicy.fromStatements([
                new iam.PolicyStatement({
                    actions: ['lambda:InvokeFunction'],
                    resources: [triggerBuildFunction.functionArn]
                })
            ])
        });

        triggerInitialBuild.node.addDependency(buildProject);




        // Hosted Zone and Certificate
        const hostedZoneId = cdk.Fn.importValue(`${props.stageName}-HostedZoneId`);
        const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'BusinessHostedZone', {
            hostedZoneId:`Z07188782GYXEXVEVQEKI`,
            zoneName: `${props.subDomain}.${DOMAIN}`,
        });

        const certificate = new acm.Certificate(this, 'BusinessWebsiteCertificate', {
            domainName: `${props.subDomain}.${DOMAIN}`,
            validation: acm.CertificateValidation.fromDns(hostedZone),
        });

        // CloudFront Distribution
        const s3Origin = new origins.S3StaticWebsiteOrigin(websiteBucket);
        const distribution = new cloudfront.Distribution(this, 'BusinessWebsiteDistribution', {
            defaultRootObject: 'index.html',

            domainNames: [`${props.subDomain}.${DOMAIN}`],
            certificate: certificate,
            minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
            defaultBehavior: {
                origin: s3Origin,
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
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

        // Route53 Alias Record
        new route53.ARecord(this, 'BusinessWebsiteAliasRecord', {
            zone: hostedZone,
            target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
        });

        // Outputs
        new cdk.CfnOutput(this, 'BusinessWebsiteBucketName', {
            value: websiteBucket.bucketName,
            description: 'Business Website S3 Bucket Name',
        });

        new cdk.CfnOutput(this, 'BusinessWebsiteDistributionDomainName', {
            value: distribution.distributionDomainName,
            description: 'CloudFront Distribution Domain Name for Business Website',
        });


    }
}
