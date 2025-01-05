import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { ApiStackProps } from '../../global/props';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { DOMAIN, UP_CUSTOMER_ID } from '../../global/constants';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { UsersApiStack } from './APIs/UserApiStack';

export class ApiGatewayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const hostedZoneId = cdk.Fn.importValue(`${props.stageName}-API-HostedZoneId`);

    const parentHostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: hostedZoneId,
      zoneName: `${props.subDomain}.${DOMAIN}`,
    });

    const certificate = new acm.Certificate(this, 'Certificate', {
        domainName:`${props.apiDomain}.${DOMAIN}`,
        validation: acm.CertificateValidation.fromDns(parentHostedZone),
    });

    const userPoolId = cdk.Fn.importValue(UP_CUSTOMER_ID);
    const userPool = cognito.UserPool.fromUserPoolId(this, 'ImportedUserPool', userPoolId);
    
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
        cognitoUserPools: [userPool],
    });

    // Create Custom Domain API
    const api = new apigateway.RestApi(this, 'myRewardsApi', {
        restApiName: 'myRewards API',
        description: 'This is an API for Lambda functions.',
        deployOptions: {
            stageName: `${props.stageName}`,
        },
        domainName: {
            domainName: `${props.apiDomain}.${DOMAIN}`,
            certificate: certificate,
            endpointType: apigateway.EndpointType.EDGE,
            securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
            },
    });

    new UsersApiStack(this, 'UsersApiStack', {
      api: api,
      authorizer
    });

    // Additional API resources (e.g., Shops, Organizations) can follow the same pattern
  }
}










export class testS extends cdk.Stack {

    constructor(scope: Construct, id: string, props: ApiStackProps) {
        super(scope, id, props);

        const hostedZoneId = cdk.Fn.importValue(`${props.stageName}-API-HostedZoneId`);

        const parentHostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
          hostedZoneId: hostedZoneId,
          zoneName: `${props.subDomain}.${DOMAIN}`,
        });

        const certificate = new acm.Certificate(this, 'Certificate', {
            domainName:`${props.apiDomain}.${DOMAIN}`,
            validation: acm.CertificateValidation.fromDns(parentHostedZone),
        });

        const userPoolId = cdk.Fn.importValue(UP_CUSTOMER_ID);
        const userPool = cognito.UserPool.fromUserPoolId(this, 'ImportedUserPool', userPoolId);
        const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
            cognitoUserPools: [userPool],
        });

        const usersTable = dynamodb.Table.fromTableArn(this, 'ImportedUsersTable', cdk.Fn.importValue('UserTableARN'));
        const organizationTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTable', cdk.Fn.importValue('OrganizationTableARN'));
        const shopTable = dynamodb.Table.fromTableArn(this, 'ImportedShopTable', cdk.Fn.importValue('ShopTableARN'));       
        
        // Create Custom Domain API
        const api = new apigateway.RestApi(this, 'myRewardsApi', {
            restApiName: 'myRewards API',
            description: 'This is an API for Lambda functions.',
            deployOptions: {
                stageName: `${props.stageName}`,
            },
            domainName: {
                domainName: `${props.apiDomain}.${DOMAIN}`,
                certificate: certificate,
                endpointType: apigateway.EndpointType.EDGE,
                securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
              },
        });

        // API Lambda Functions
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

        // Granting Access
        usersTable.grantReadData(getUserLambda);
        usersTable.grantWriteData(createUserLambda);
        
        // User API
        const usersApi = api.root.addResource('user'); 

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

        // Shop + Shops API
        const shopApi = api.root.addResource('shop'); 
        const shopsApi = api.root.addResource('shops'); 


        // Organization API
        const organizationApi = api.root.addResource('organization'); 

    }
}
