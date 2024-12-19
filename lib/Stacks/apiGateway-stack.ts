import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { StackProps } from '../../global/props';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { UP_CUSTOMER_ID } from '../../global/constants';

export class ApiGatewayStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const userPoolId = cdk.Fn.importValue(UP_CUSTOMER_ID);
        const userPool = cognito.UserPool.fromUserPoolId(this, 'ImportedUserPool', userPoolId);

        const getUserLambda = new lambda.Function(this, 'getUserLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'getUser.handler', 
            code: lambda.Code.fromAsset('lambda'),
            environment:{
                USERS_TABLE:'Users'
            }
        });

        const createUserLambda = new lambda.Function(this, 'createUserLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'createUser.handler', 
            code: lambda.Code.fromAsset('lambda'),
            environment:{
                USERS_TABLE:'Users'
            }
        });

        const usersTable = dynamodb.Table.fromTableArn(this, 'ImportedUsersTable', cdk.Fn.importValue('UserTableARN'));
        const organizationTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTable', cdk.Fn.importValue('OrganizationTableARN'));
        usersTable.grantReadData(getUserLambda);
        usersTable.grantWriteData(createUserLambda);

        // Create a Cognito User Pool authorizer for API Gateway
        const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
            cognitoUserPools: [userPool],
        });

        const api = new apigateway.RestApi(this, 'myRewardsApi', {
            restApiName: 'myRewards API',
            description: 'This is an API for Lambda functions.',
            deployOptions: {
                stageName: `${props.stageName}`,
            },
        });

        // resource, an api function ex: myrewards.com/users
        // create for different api functions
        const usersApi = api.root.addResource('users'); 

        const getUserIntegration = new apigateway.LambdaIntegration(getUserLambda);
        usersApi.addMethod('GET', getUserIntegration, {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });

        const createUserIntegration = new apigateway.LambdaIntegration(createUserLambda);
        usersApi.addMethod('POST', createUserIntegration, {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });

        usersTable.grantReadWriteData(createUserLambda);
    usersTable.grantReadWriteData(getUserLambda);


        new cdk.CfnOutput(this, 'ApiUrl', {
            value: api.url,
            description: 'The URL of the API Gateway',
        });
    }
}
