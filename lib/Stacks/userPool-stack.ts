import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { COGNITO_DOMAIN_PREFIX } from '../../global/constants';
import { stackProps } from '../../global/props';

export class userPoolStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: stackProps) {
        super(scope, id, props);

        // userPool
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
            customAttributes: {
              role: new cognito.StringAttribute({ mutable: true })
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
            }
        });

        // cognito Domain
        const cognitoDomain = new cognito.UserPoolDomain(this, 'CognitoDomain', {
            userPool,
            cognitoDomain: {
                domainPrefix: `${COGNITO_DOMAIN_PREFIX}-${props.stageName}`,
            },
        });

        // userPool Client
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

        // Identity Pool
          const identityPool = new cognito.CfnIdentityPool(this, 'myRewards_IdentityPool', {
            allowUnauthenticatedIdentities: true,
            cognitoIdentityProviders: [
              {
                clientId: userPoolClient.userPoolClientId,
                providerName: userPool.userPoolProviderName,
              },
            ],
          });

          const authenticatedPolicy = new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: [
                  'execute-api:Invoke',
                ],
                resources: [`arn:aws:execute-api:${this.region}:${props.env?.account}:*`], 
              }),
            ],
          });
          
          const unauthenticatedPolicy = new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: [
                  'dynamodb:ListStreams',
                  'dynamodb:DescribeStream',
                  'dynamodb:GetRecords',
                  'dynamodb:GetShardIterator',
                ],
                resources: [`arn:aws:dynamodb:${this.region}:${props.env?.account}:table/*`], 
              }),
            ],
          });

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

        // attach roles to cognito
        new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
            identityPoolId: identityPool.ref,
            roles: {
            'authenticated': authenticatedRole.roleArn,
            'unauthenticated': unauthenticatedRole.roleArn,
            }
        });

        // create customer and business groups
        new cognito.CfnUserPoolGroup(this, 'CustomersGroup', {
            groupName: 'Customers',
            userPoolId: userPool.userPoolId,
            description: 'Group for regular customers',
            precedence: 1,
            roleArn: authenticatedRole.roleArn,
        });

        new cognito.CfnUserPoolGroup(this, 'BusinessGroup', {
            groupName: 'Businesses',
            userPoolId: userPool.userPoolId,
            description: 'Group for business accounts',
            precedence: 2,
            roleArn: authenticatedRole.roleArn, 
        });

        // Output Resources
        new cdk.CfnOutput(this, 'UserPoolClient', {
            value: userPoolClient.userPoolClientId,
            description: 'The ID of the Cognito User Pool Client',
            exportName:'UserPoolClient'
        });

        new cdk.CfnOutput(this, 'IdentityPool', {
            value: identityPool.attrId,
            description: 'The ID of the Cognito IdentityPool',
            exportName:'IdentityPool'
        });

        new cdk.CfnOutput(this, 'CognitoDomainName', {
            value: cognitoDomain.domainName,
            description: 'The Domain of the Cognito User Pool',
            exportName:'CognitoDomainName'
        });

        new cdk.CfnOutput(this, 'userPoolID', {
            value: userPool.userPoolId,
            description: 'The ID of the User Pool',
            exportName:'userPoolID'
        });

        new cdk.CfnOutput(this, 'AuthenticatedRoleARN', {
            value: authenticatedRole.roleArn,
            description: 'ARN of authenticated Role',
            exportName:'AuthenticatedRoleARN'
        });
    }
}
