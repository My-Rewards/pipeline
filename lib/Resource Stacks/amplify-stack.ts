import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { COGNITO_DOMAIN_PREFIX } from '../../global/constants';
import { stackProps } from '../../global/props';

export class amplifyStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: stackProps) {
        super(scope, id, props);

        // Create Cognito User Pool for authentication
        const userPool = new cognito.UserPool(this, 'userPool', {
            userPoolName: 'myRewardsUsers',
            selfSignUpEnabled: true,
            signInAliases: {
                email: true,
            },
            autoVerify: { email: true },
            standardAttributes: {
                email: { required: true, mutable: false },
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
            }
        });

        const cognitoDomain = new cognito.UserPoolDomain(this, 'CognitoDomain', {
            userPool,
            cognitoDomain: {
                domainPrefix: `${COGNITO_DOMAIN_PREFIX}-${props.stageName}`,
            },
        });

        const userPoolClient = new cognito.UserPoolClient(this, 'userPoolClient', {
            userPool,
            generateSecret: false,
            authFlows: {
              userPassword: true,
              userSrp: true,
            },
            oAuth: {
              flows: {
                implicitCodeGrant: true,
              },
              callbackUrls: ['exp://127.0.0.1:19000/--/'],
              logoutUrls: ['exp://127.0.0.1:19000/--/'],
            }
          });

        const authenticatedPolicy = new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ['dynamodb:Query', 'dynamodb:Scan', 'dynamodb:GetItem'],
                resources: ['arn:aws:dynamodb:us-east-1:123456789012:table/YourDynamoDBTable'], // Replace with your DynamoDB Table ARN
              }),
              new iam.PolicyStatement({
                actions: ['*'],
                resources: ['*'],
              }),
            ],
          });

        const unauthenticatedPolicy = new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ['s3:GetObject'],
                resources: ['arn:aws:s3:::your-public-bucket/*'],
              }),
            ],
          });

          const identityPool = new cognito.CfnIdentityPool(this, 'myRewards_IdentityPool', {
            allowUnauthenticatedIdentities: true,
            cognitoIdentityProviders: [
              {
                clientId: userPoolClient.userPoolClientId,
                providerName: userPool.userPoolProviderName,
              },
            ],
          });

        // Create IAM roles for authenticated and unauthenticated users
        const unauthenticatedRole = new iam.Role(this, 'UnauthenticatedRole', {
            assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
              'StringEquals': { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
              'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'unauthenticated' }
            }, 'sts:AssumeRoleWithWebIdentity'),
            inlinePolicies: {
                'unauthenticatedPolicy': unauthenticatedPolicy,
            },
        });

        const authenticatedRole = new iam.Role(this, 'AuthenticatedRole', {
            assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
              'StringEquals': { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
              'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' }
            }, 'sts:AssumeRoleWithWebIdentity'),
            inlinePolicies: {
                'authenticatedPolicy': authenticatedPolicy,
            },
        });

        new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
            identityPoolId: identityPool.ref,
            roles: {
            'authenticated': authenticatedRole.roleArn,
            'unauthenticated': unauthenticatedRole.roleArn,
            }
        });

        const amplifyApp = new amplify.CfnApp(this, `myRewards-${props?.stackName}`, {
            name: 'myRewards',
            iamServiceRole: authenticatedRole.roleArn,
            environmentVariables: [
                {
                  name: 'USER_POOL_ID',
                  value: userPool.userPoolId,
                },
                {
                  name: 'USER_POOL_CLIENT_ID',
                  value: userPoolClient.userPoolClientId,
                }
              ],
        });

        new cdk.CfnOutput(this, 'UserPoolId', {
            value: userPool.userPoolId,
            description: 'The ID of the Cognito User Pool',
        });

        new cdk.CfnOutput(this, 'UserPoolClient', {
            value: userPoolClient.userPoolClientId,
            description: 'The ID of the Cognito User Pool Client',
        });

        new cdk.CfnOutput(this, 'IdentityPool', {
            value: identityPool.attrId,
            description: 'The ID of the Cognito IdentityPool',
        });

        new cdk.CfnOutput(this, 'Cognito Domain', {
            value: cognitoDomain.domainName,
            description: 'The Domain of the Cognito User Pool',
        });

        new cdk.CfnOutput(this, 'AmplifyAppId', {
            value: amplifyApp.attrAppId,
            description: 'The ID of the Amplify app',
        });
    }
}
