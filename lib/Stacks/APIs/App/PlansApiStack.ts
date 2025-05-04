import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import {DATABASE_NAME} from "../../../../global/constants";
import {getAuroraAccess} from "../../util/aurora-access";
import * as iam from 'aws-cdk-lib/aws-iam';

interface UserPlansStackProps extends cdk.NestedStackProps {
    appRoot:  cdk.aws_apigateway.Resource
    authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
}

export class PlansApiStack extends cdk.NestedStack {
    constructor(scope: Construct, id: string, props: UserPlansStackProps) {
        super(scope, id, props);

        // Get infrastructure resources using the helper function
        const { vpc, clusterSecret, clusterArn, clusterRole, securityGroupResolvers } = getAuroraAccess(this, id);

        const orgTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTableARN', cdk.Fn.importValue('OrganizationTableARN'));
        const plansTable = dynamodb.Table.fromTableArn(this, 'ImportedPlanTableARN', cdk.Fn.importValue('PlanTableARN'));
        const rewardsTable = dynamodb.Table.fromTableArn(this, 'ImportedBizzRewardsTable', cdk.Fn.importValue('RewardsTableARN'));
        const shopTable = dynamodb.Table.fromTableArn(this, 'ImportedShopsTableARN', cdk.Fn.importValue('ShopTableARN'));

        const fetchPlanLambda = new nodejs.NodejsFunction(this, "fetchAppPlan",{
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: 'lambda/user/Plans/getPlan.ts',
            functionName:'Fetch-User-Plan',
            handler: 'handler',
            environment: {
                PLANS_TABLE: plansTable.tableName,
                REWARDS_TABLE: rewardsTable.tableName,
                ORG_TABLE: orgTable.tableName
            },
            bundling: {
                externalModules: ['aws-sdk'],
            },
            description: 'Fetch user plans Lambda (v1.0.2)'
        })
        orgTable.grantReadData(fetchPlanLambda);
        plansTable.grantReadData(fetchPlanLambda);
        rewardsTable.grantReadData(fetchPlanLambda);
        fetchPlanLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:Query"],
                resources: [`${rewardsTable.tableArn}/index/*`]
            })
        );

        const fetchPlansLambda = new nodejs.NodejsFunction(this, "fetchAppPlans",{
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: 'lambda/user/Plans/getPlans.ts',
            functionName:'Fetch-User-Plans',
            handler: 'handler',
            vpc,
            role: clusterRole,
            securityGroups: [securityGroupResolvers],
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
            },
            environment: {
                PLANS_TABLE: plansTable.tableName,
                ORG_TABLE: orgTable.tableName,
                REWARDS_TABLE: rewardsTable.tableName,
                DB_NAME: DATABASE_NAME,
                CLUSTER_ARN: clusterArn,
                SECRET_ARN: clusterSecret.secretArn,
            },
            bundling: {
                externalModules: ['aws-sdk'],
            },
            description: 'Fetch user plans Lambda (v1.0.0)'
        })
        orgTable.grantReadData(fetchPlansLambda);
        plansTable.grantReadData(fetchPlansLambda);
        shopTable.grantReadData(fetchPlansLambda);
        rewardsTable.grantReadData(fetchPlansLambda);
        fetchPlanLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:Query"],
                resources: [
                    rewardsTable.tableArn,
                    `${rewardsTable.tableArn}/index/*`,
                ],
            })
        );

        const fetchLikedPlansLambda = new nodejs.NodejsFunction(this, "fetchLikedAppPlans",{
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: 'lambda/user/Plans/getLikedPlans.ts',
            functionName:'Fetch-Liked-User-Plans',
            handler: 'handler',
            vpc,
            role: clusterRole,
            securityGroups: [securityGroupResolvers],
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
            },
            environment: {
                PLANS_TABLE: plansTable.tableName,
                ORG_TABLE: orgTable.tableName,
                REWARDS_TABLE: rewardsTable.tableName,
                DB_NAME: DATABASE_NAME,
                CLUSTER_ARN: clusterArn,
                SECRET_ARN: clusterSecret.secretArn,
            },
            bundling: {
                externalModules: ['aws-sdk'],
            },
            description: 'Fetch user plans Lambda (v1.0.0)'
        })
        orgTable.grantReadData(fetchLikedPlansLambda);
        plansTable.grantReadData(fetchLikedPlansLambda);
        shopTable.grantReadData(fetchLikedPlansLambda);
        rewardsTable.grantReadData(fetchLikedPlansLambda);
        fetchLikedPlansLambda.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ["dynamodb:Query"],
                resources: [`${rewardsTable.tableArn}/index/*`]
            })
        );

        const redeemRewardLambda = new nodejs.NodejsFunction(this, "redeemReward",{
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: 'lambda/user/Rewards/redeem.ts',
            functionName:'Redeem-Reward',
            handler: 'handler',
            environment: {
                REWARDS_TABLE: rewardsTable.tableName,
            },
            bundling: {
                externalModules: ['aws-sdk'],
            },
            description: 'Fetch user plans Lambda (v1.0.2)'
        })
        rewardsTable.grantReadWriteData(redeemRewardLambda);

        const plansApi = props.appRoot.addResource('plans');
        const rewards = props.appRoot.addResource('rewards');
        const fetchPlanApi = plansApi.addResource('plan');
        const fetchLikedPlansApi = plansApi.addResource('favorite');
        const redeemRewardApi = rewards.addResource('redeem');

        const fetchPlan = new apigateway.LambdaIntegration(fetchPlanLambda);
        const fetchPlans = new apigateway.LambdaIntegration(fetchPlansLambda);
        const fetchLikedPlans = new apigateway.LambdaIntegration(fetchLikedPlansLambda);
        const redeemRewardsPlan = new apigateway.LambdaIntegration(redeemRewardLambda);

        fetchPlanApi.addMethod('GET', fetchPlan, {
            authorizer: props.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        plansApi.addMethod('GET', fetchPlans, {
            authorizer: props.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        fetchLikedPlansApi.addMethod('GET', fetchLikedPlans, {
            authorizer: props.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        redeemRewardApi.addMethod('PUT', redeemRewardsPlan, {
            authorizer: props.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
    }
}
