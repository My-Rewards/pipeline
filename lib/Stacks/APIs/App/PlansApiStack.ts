import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'

interface UserPlansStackProps extends cdk.NestedStackProps {
    appRoot:  cdk.aws_apigateway.Resource
    authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
}

export class PlansApiStack extends cdk.NestedStack {
    constructor(scope: Construct, id: string, props: UserPlansStackProps) {
        super(scope, id, props);

        const orgTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTableARN', cdk.Fn.importValue('OrganizationTableARN'));
        const plansTable = dynamodb.Table.fromTableArn(this, 'ImportedPlanTableARN', cdk.Fn.importValue('PlanTableARN'));
        const userTable = dynamodb.Table.fromTableArn(this, 'ImportedBizzUsersTable', cdk.Fn.importValue('BizzUserTableARN'));

        const fetchPlanLambda = new nodejs.NodejsFunction(this, "fetchAppPlan",{
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: 'lambda/user/Plans/getPlan.ts',
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
            entry: 'lambda/user/Plans/getPlan.ts',
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

        const planApi = props.appRoot.addResource('plans');
        const fetchPlansApi = planApi.addResource('plan');

        const fetchPlan = new apigateway.LambdaIntegration(fetchPlanLambda);

        fetchPlansApi.addMethod('GET', fetchPlan, {
            authorizer: props.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
    }
}
