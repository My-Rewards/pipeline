import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { AuroraStackProps } from "../../global/props";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as Aurora from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as cr from 'aws-cdk-lib/custom-resources';
import { Duration } from "aws-cdk-lib";
import { DATABASE_NAME } from "../../global/constants";

export class AuroraStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: AuroraStackProps) {
        super(scope, id, props);

        const isProd = props.stageName === 'prod';

        const vpc = new ec2.Vpc(this, 'AuroraVpc', {
            vpcName: 'Aurora-vpc',
            maxAzs: 2,
            natGateways: 0,
            subnetConfiguration: [
                {
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                    cidrMask: 24,
                    name: 'aurora-isolated-subnet'
                }
            ]
        });

        const securityGroupResolvers = new ec2.SecurityGroup(this, 'SecurityGroupResolvers', {
            vpc,
            securityGroupName: 'resolvers-sg',
            description: 'Security Group with Resolvers',
        })

        const securityGroupAurora = new ec2.SecurityGroup(this, 'SecurityGroupAurora', {
            vpc,
            securityGroupName: 'Aurora-sg',
            description: 'Security Group with Aurora',
        })

        securityGroupAurora.addIngressRule(
            securityGroupResolvers,
            ec2.Port.tcp(5432),
            'Allow inbound traffic to Aurora'
        )

        vpc.addInterfaceEndpoint('LAMBDA', {
            service: ec2.InterfaceVpcEndpointAwsService.LAMBDA,
            subnets: { subnets: vpc.isolatedSubnets },
            securityGroups: [securityGroupResolvers],
        })

        vpc.addInterfaceEndpoint('SECRETS_MANAGER', {
            service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
            subnets: { subnets: vpc.isolatedSubnets },
            securityGroups: [securityGroupResolvers],
        })


        const AuroraSecretCredentials = new secretsmanager.Secret(this, 'AuroraSecretCredentials', {
            secretName: `${props.stageName}-aurora-credentials`,
            description: 'Aurora Postgresql Credentials DO NOT DELETE OR DUPLICATE THIS SECRET TO OTHER ENVIRONMENTS',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({ username: 'clusteradmin' }),
                excludePunctuation: true,
                includeSpace: false,
                generateStringKey: 'password'
            }
        });

        const parameterGroup = new Aurora.ParameterGroup(this, 'AuroraPostgres13ParamGroup', {
            engine: Aurora.DatabaseClusterEngine.auroraPostgres({
                version: Aurora.AuroraPostgresEngineVersion.VER_15_10
            }),
            description: 'Parameter group for Aurora PostgreSQL 13',
            parameters: {
                shared_preload_libraries: 'pg_stat_statements',
            },
        });

        const role = new iam.Role(this, 'Role', {
            roleName: `${props.stageName}-Aurora-role`,
            description: 'Role used in the  Serverless cluster',
            assumedBy: new iam.CompositePrincipal(
                new iam.ServicePrincipal('ec2.amazonaws.com'),
                new iam.ServicePrincipal('lambda.amazonaws.com'),
                new iam.ServicePrincipal('rds.amazonaws.com'),
            )
        });

        role.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    'cloudwatch:PutMetricData',
                    "ec2:CreateNetworkInterface",
                    "ec2:DescribeNetworkInterfaces",
                    "ec2:DeleteNetworkInterface",
                    "ec2:DescribeInstances",
                    "ec2:DescribeSubnets",
                    "ec2:DescribeSecurityGroups",
                    "ec2:DescribeRouteTables",
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                    'lambda:InvokeFunction',
                    'secretsmanager:GetSecretValue',
                    'kms:*',
                    'Aurora-db:connect'
                ],
                resources: ['*']
            })
        );

        const cluster = new Aurora.DatabaseCluster(this, 'AuroraServerlessCluster', {
            engine: Aurora.DatabaseClusterEngine.auroraPostgres({
                version: Aurora.AuroraPostgresEngineVersion.VER_15_10
            }),
            credentials: Aurora.Credentials.fromSecret(AuroraSecretCredentials),
            vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
            securityGroups: [securityGroupAurora],
            parameterGroup,
            defaultDatabaseName: DATABASE_NAME,
            serverlessV2MinCapacity: 0.5,
            serverlessV2MaxCapacity: isProd ? 10 : 1,
            writer: Aurora.ClusterInstance.serverlessV2('writer'),
            readers:
                [
                    Aurora.ClusterInstance.serverlessV2('reader1', {
                        scaleWithWriter: true,
                    }),
                ],
            enableDataApi: true,
            backup: {
                retention: Duration.days(isProd ? 10 : 1),
            },
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });

        const setupPostgisFunction = new nodejs.NodejsFunction(this, 'SetupPostgisFunction', {
            entry: 'lambda/Aurora/instantiate.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
            timeout: Duration.minutes(5),
            vpc,
            securityGroups: [securityGroupResolvers],
            vpcSubnets: { subnets: vpc.isolatedSubnets },
            environment: {
                SECRET_ARN: AuroraSecretCredentials.secretArn,
                DATABASE_NAME,
            },
            role,
        });

        const setupPostgisResource = new cr.AwsCustomResource(this, 'SetupPostgisResource', {
            onCreate: {
                service: 'Lambda',
                action: 'invoke',
                parameters: {
                    FunctionName: setupPostgisFunction.functionName,
                    InvocationType: 'RequestResponse',
                },
                physicalResourceId: cr.PhysicalResourceId.of('SetupPostgisResource'),
            },
            onUpdate: {
                service: 'Lambda',
                action: 'invoke',
                parameters: {
                    FunctionName: setupPostgisFunction.functionName,
                    InvocationType: 'RequestResponse',
                },
                physicalResourceId: cr.PhysicalResourceId.of('SetupPostgisResource'),
            },
            policy: cr.AwsCustomResourcePolicy.fromStatements([
                new iam.PolicyStatement({
                    actions: ['lambda:InvokeFunction'],
                    resources: [setupPostgisFunction.functionArn],
                }),
            ]),
        });

        setupPostgisResource.node.addDependency(cluster);

        new cdk.CfnOutput(this, 'ClusterARN', {
            value: cluster.clusterArn,
            description: 'Cluster ARN',
            exportName: `ClusterARN`,
        });

        new cdk.CfnOutput(this, 'AuroraSecretARN', {
            value: AuroraSecretCredentials.secretArn,
            description: 'Aurora Secret ARN',
            exportName: `AuroraSecretARN`,
        });

        new cdk.CfnOutput(this, 'ClusterVPCId', {
            value: vpc.vpcId,
            description: 'Cluster VPC ID',
            exportName: `ClusterVPCId`,
        });

        vpc.isolatedSubnets.forEach((subnet, index) => {
            new cdk.CfnOutput(this, `PrivateSubnet${index + 1}Id`, {
                value: subnet.subnetId,
                description: `Private Isolated Subnet ${index + 1} ID`,
                exportName: `PrivateSubnet${index + 1}Id`,
            });
        });
        
        new cdk.CfnOutput(this, 'ClusterRoleARN', {
            value: role.roleArn,
            description: 'Cluster Role ARN',
            exportName: `ClusterRoleARN`,
        });

        new cdk.CfnOutput(this, 'SecurityGroupResolversId', {
            value: securityGroupResolvers.securityGroupId,
            description: 'Security Group ID for Resolvers',
            exportName: 'SecurityGroupResolversId',
        });

        new cdk.CfnOutput(this, 'SecurityGroupAuroraId', {
            value: securityGroupAurora.securityGroupId,
            description: 'Security Group ID for Aurora',
            exportName: 'SecurityGroupAuroraId',
        });

    }
}