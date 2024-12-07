import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { 
    AUTHENTICATED_ROLE, 
    COGNITO_DOMAIN_PREFIX, 
    UP_CUSTOMER_ID, 
    UPC_CUSTOMER,
    UP_BUSINESS_ID,
    UPC_BUSINESS,
    IDENTITY_POOL,
    CUSTOMER_DOMAIN,
    BUSINESS_DOMAIN,
    ADMIN_DOMAIN,
    UP_ADMIN_ID,
    UPC_ADMIN
 } from '../../global/constants';
import { stackProps } from '../../global/props';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class userPoolStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: stackProps) {
        super(scope, id, props);

        const postConfirmation = new lambda.Function(this, 'PostConfirmationFunction', {
          runtime: lambda.Runtime.NODEJS_20_X,
          code: lambda.Code.fromAsset('lambda'),
          handler: 'confirmUser.handler',
        });

        // userPool - Customers
        const userPool_Customer = new cognito.UserPool(this, 'userPool_Customer', {
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
            },
            lambdaTriggers: {
              postConfirmation: postConfirmation,
            }
        });

        // userPool - Business
        const userPool_Business = new cognito.UserPool(this, 'userPool_Business', {
          userPoolName: 'myRewardsBusiness',
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
          },
          lambdaTriggers: {
            postConfirmation: postConfirmation,
          }
        });

        // userPool - Admin
        const userPool_Admin = new cognito.UserPool(this, 'userPool_Admin', {
          userPoolName: 'myRewardsAdmin',
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

        // cognito Domain - Customers
        const cognitoDomain_Customer = new cognito.UserPoolDomain(this, 'CognitoDomain_Customer', {
            userPool:userPool_Customer,
            cognitoDomain: {
                domainPrefix: `${COGNITO_DOMAIN_PREFIX}-${props.stageName}-customer`,
            },
        });

        // cognito Domain - Business
        const cognitoDomain_Business = new cognito.UserPoolDomain(this, 'CognitoDomain_Business', {
          userPool:userPool_Business,
          cognitoDomain: {
              domainPrefix: `${COGNITO_DOMAIN_PREFIX}-${props.stageName}-business`,
          },
        });

        // cognito Domain - Admin
        const cognitoDomain_Admin = new cognito.UserPoolDomain(this, 'CognitoDomain_Admin', {
          userPool:userPool_Admin,
          cognitoDomain: {
              domainPrefix: `${COGNITO_DOMAIN_PREFIX}-${props.stageName}-admin`,
          },
        });

        // userPool Client - Customers
        const userPoolClient_Customer = new cognito.UserPoolClient(this, 'userPoolClient_Customer', {
            userPool:userPool_Customer,
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

        // userPool Client - Business
        const userPoolClient_Business = new cognito.UserPoolClient(this, 'userPoolClient_Business', {
          userPool:userPool_Business,
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

        // userPool Client - Admin
        const userPoolClient_Admin = new cognito.UserPoolClient(this, 'userPoolClient_Admin', {
          userPool:userPool_Admin,
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
              clientId: userPoolClient_Customer.userPoolClientId,
              providerName: userPool_Customer.userPoolProviderName,
            },
            {
              clientId: userPoolClient_Business.userPoolClientId,
              providerName: userPool_Business.userPoolProviderName,
            }
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

        // Output Resources

        // ----- UserPools ------
        new cdk.CfnOutput(this, UPC_CUSTOMER, {
            value: userPoolClient_Customer.userPoolClientId,
            description: 'The ID of the Cognito User Pool Client',
            exportName: UPC_CUSTOMER
        });
        new cdk.CfnOutput(this, UP_CUSTOMER_ID, {
          value: userPool_Customer.userPoolId,
          description: 'The ID of the User Pool',
          exportName: UP_CUSTOMER_ID
        });
        new cdk.CfnOutput(this, CUSTOMER_DOMAIN, {
          value: cognitoDomain_Customer.domainName,
          description: 'The Domain of the Cognito User Pool',
          exportName: CUSTOMER_DOMAIN
        });

        new cdk.CfnOutput(this, UPC_BUSINESS, {
          value: userPoolClient_Business.userPoolClientId,
          description: 'The ID of the Cognito User Pool Client',
          exportName: UPC_BUSINESS
        });
        new cdk.CfnOutput(this, UP_BUSINESS_ID, {
          value: userPool_Business.userPoolId,
          description: 'The ID of the User Pool',
          exportName: UP_BUSINESS_ID
        });
        new cdk.CfnOutput(this, BUSINESS_DOMAIN, {
          value: cognitoDomain_Business.domainName,
          description: 'The Domain of the Cognito User Pool',
          exportName: BUSINESS_DOMAIN
        });

        new cdk.CfnOutput(this, UPC_ADMIN, {
          value: userPoolClient_Admin.userPoolClientId,
          description: 'The ID of the Cognito User Pool Client',
          exportName: UPC_ADMIN
        });
        new cdk.CfnOutput(this, UP_ADMIN_ID, {
          value: userPool_Admin.userPoolId,
          description: 'The ID of the User Pool',
          exportName: UP_ADMIN_ID
        });
        new cdk.CfnOutput(this, ADMIN_DOMAIN, {
          value: cognitoDomain_Admin.domainName,
          description: 'The Domain of the Cognito User Pool',
          exportName: ADMIN_DOMAIN
        });


        new cdk.CfnOutput(this, IDENTITY_POOL, {
            value: identityPool.attrId,
            description: 'The ID of the Cognito IdentityPool',
            exportName: IDENTITY_POOL
        });
        new cdk.CfnOutput(this, AUTHENTICATED_ROLE, {
          value: authenticatedRole.roleArn,
          description: 'ARN of authenticated Role',
          exportName: AUTHENTICATED_ROLE
        });
        
    }
}