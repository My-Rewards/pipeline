import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import {DATABASE_NAME} from "../../../../global/constants";
import {getAuroraAccess} from "../../util/aurora-access";

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
        const userTable = dynamodb.Table.fromTableArn(this, 'ImportedBizzUsersTable', cdk.Fn.importValue('BizzUserTableARN'));
        const shopTable = dynamodb.Table.fromTableArn(this, 'ImportedShopsTableARN', cdk.Fn.importValue('ShopTableARN'));

        const fetchPlanLambda = new nodejs.NodejsFunction(this, "fetchAppPlan",{
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: 'lambda/user/Plans/getPlan.ts',
            functionName:'Fetch-User-Plan',
            handler: 'handler',
            environment: {
                PLANS_TABLE: plansTable.tableName,
                ORG_TABLE: orgTable.tableName
            },
            bundling: {
                externalModules: ['aws-sdk'],
            },
        })
        orgTable.grantReadData(fetchPlanLambda);
        plansTable.grantReadData(fetchPlanLambda);

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
                DB_NAME: DATABASE_NAME,
                CLUSTER_ARN: clusterArn,
                SECRET_ARN: clusterSecret.secretArn,
            },
            bundling: {
                externalModules: ['aws-sdk'],
            },
        })
        orgTable.grantReadData(fetchPlansLambda);
        plansTable.grantReadData(fetchPlansLambda);
        shopTable.grantReadData(fetchPlansLambda);

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
                DB_NAME: DATABASE_NAME,
                CLUSTER_ARN: clusterArn,
                SECRET_ARN: clusterSecret.secretArn,
            },
            bundling: {
                externalModules: ['aws-sdk'],
            },
        })
        orgTable.grantReadData(fetchLikedPlansLambda);
        plansTable.grantReadData(fetchLikedPlansLambda);
        shopTable.grantReadData(fetchLikedPlansLambda);

        const plansApi = props.appRoot.addResource('plans');
        const fetchPlanApi = plansApi.addResource('plan');
        const fetchLikedPlansApi = plansApi.addResource('favorite');

        const fetchPlan = new apigateway.LambdaIntegration(fetchPlanLambda);
        const fetchPlans = new apigateway.LambdaIntegration(fetchPlansLambda);
        const fetchLikedPlans = new apigateway.LambdaIntegration(fetchLikedPlansLambda);

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
    }
}
