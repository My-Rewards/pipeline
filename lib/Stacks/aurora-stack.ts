import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cr from 'aws-cdk-lib/custom-resources';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as Aurora from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { Duration } from "aws-cdk-lib";
import { GenericStackProps } from "../../global/props";
import { DATABASE_NAME } from "../../global/constants";

export class AuroraStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: GenericStackProps) {
        super(scope, id, props);

        const isProd = props.stageName === 'prod';

        const vpc = ec2.Vpc.fromLookup(this, "ImportedVPC", {
            tags: {
                Name: `aurora-vpc-${props.stageName}`,
            }
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

        securityGroupResolvers.addEgressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(443),
            'Allow outbound HTTPS traffic'
        );

        const endpointConfigs = [
            { id: 'LAMBDA', service: ec2.InterfaceVpcEndpointAwsService.LAMBDA, subnets: vpc.privateSubnets },
            { id: 'SECRETS_MANAGER', service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER, subnets: vpc.privateSubnets },
        ];

        endpointConfigs.forEach(config => {
            vpc.addInterfaceEndpoint(config.id, {
                service: config.service,
                subnets: { subnets: config.subnets },
                securityGroups: [securityGroupResolvers]
            });
        });

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
            name: `${props.stageName}-aurora-param-group`,
            removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
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
                    'dynamodb:Query',
                    'dynamodb:GetItem',
                    'kms:*',
                    'Aurora-db:connect',
                    'rds-data:ExecuteStatement'
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
            writer: Aurora.ClusterInstance.serverlessV2('writer-1'),
            readers: isProd
                ? [
                    Aurora.ClusterInstance.serverlessV2('reader-1'),
                    Aurora.ClusterInstance.serverlessV2('reader-2')
                ]
                : [],
            enableDataApi: true,
            backup: {
                retention: Duration.days(isProd ? 10 : 1),
            },
            removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            clusterIdentifier: `${props.stageName}-aurora-cluster`,
        });

        const setupDatabaseFunction = new nodejs.NodejsFunction(this, 'Setup-Aurora-DB', {
            entry: 'lambda/Aurora/instantiate.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
            timeout: Duration.minutes(5),
            functionName:'Setup-Aurora-DB',
            description:'Setup Aurora DB with Tables',
            environment: {
                SECRET_ARN: AuroraSecretCredentials.secretArn,
                DATABASE_NAME: DATABASE_NAME,
            },
            vpc,
            bundling: {
                nodeModules: ['aws-sdk']
            },
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
            securityGroups: [securityGroupResolvers],
        });
        AuroraSecretCredentials.grantRead(setupDatabaseFunction);

        const lambdaTrigger = new cr.AwsCustomResource(this, 'Setup-Aurora-DB-Trigger', {
            policy: cr.AwsCustomResourcePolicy.fromStatements([
                new iam.PolicyStatement({
                    actions: ['lambda:InvokeFunction'],
                    effect: iam.Effect.ALLOW,
                    resources: [setupDatabaseFunction.functionArn],
                }),
            ]),
            timeout: Duration.minutes(2),
            onCreate: {
                service: 'Lambda',
                action: 'invoke',
                parameters: {
                    FunctionName: setupDatabaseFunction.functionName,
                    InvocationType: 'Event',
                },
                physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString()),
            },
            onUpdate: {
                service: 'Lambda',
                action: 'invoke',
                parameters: {
                    FunctionName: setupDatabaseFunction.functionName,
                    InvocationType: 'Event'
                },
                physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString())
            }
        });

        lambdaTrigger.node.addDependency(cluster);

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