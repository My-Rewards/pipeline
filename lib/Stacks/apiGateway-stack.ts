import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { apiProps } from '../../global/props';

export class ApiGatewayStack extends cdk.Stack {
    public api: cdk.aws_apigateway.RestApi; 

    constructor(scope: Construct, id: string, props: apiProps) {
        super(scope, id, props);

        // set Lambda Function
        const getUserLambda = new lambda.Function(this, 'getUserLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'getUser.handler', 
            code: lambda.Code.fromAsset('lambda'),
        });

        const createUserLambda = new lambda.Function(this, 'createUserLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'createUser.handler', 
            code: lambda.Code.fromAsset('lambda'),
        });

        props.database?.usersTable.grantReadWriteData(getUserLambda);
        props.database?.usersTable.grantReadWriteData(createUserLambda);

        // Create a Cognito User Pool authorizer for API Gateway
        const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
            cognitoUserPools: [props.userPool],
        });

        // Create API
        this.api = new apigateway.RestApi(this, 'myRewardsApi', {
            restApiName: 'myRewards API',
            description: 'This is an API for Lambda functions.',
            deployOptions: {
                stageName: `${props.stageName}`,
            },
        });

        // resource, an api function ex: myrewards.com/users
        // create for different api functions
        const usersApi = this.api.root.addResource('users'); 

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

        new cdk.CfnOutput(this, 'ApiUrl', {
            value: this.api.url,
            description: 'The URL of the API Gateway',
        });
    }
}
