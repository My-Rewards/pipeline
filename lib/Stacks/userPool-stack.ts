import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { 
    AUTHENTICATED_ROLE, 
    UP_CUSTOMER_ID, 
    UPC_CUSTOMER,
    UP_BUSINESS_ID,
    UPC_BUSINESS,
    UP_ADMIN_ID,
    UPC_ADMIN,
    DOMAIN,
    IDENTITY_POOL_CUSTOMER,
    IDENTITY_POOL_BUSINESS,
    AUTHENTICATED_ROLE_BUSINESS,
 } from '../../global/constants';
import { UserPoolStackProps } from '../../global/props';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as fs from 'fs';
import * as path from 'path';

export class UserPoolStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: UserPoolStackProps) {
      super(scope, id, props);

      const usersTable = dynamodb.Table.fromTableArn(this, 'ImportedUsersTable', cdk.Fn.importValue('UserTableARN'));

      const sesStatement = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ses:SendEmail',
          'ses:SendRawEmail'
        ],
        resources: ['*']
      });      

      const verifyEmailBody = fs.readFileSync(path.join(__dirname, '../../EmailTemplate/verify-email-template.html'),'utf8');

      const postConfirmationHandlerUser = new nodejs.NodejsFunction(this, "my-user-handler",{
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: 'lambda/user/createUser.ts',
        handler: 'handler',
        environment: {
          TABLE: usersTable.tableName,
          ROLE:'user',
          EMAIL_SENDER:`no-reply@${props.authDomain}.${DOMAIN}`
        },
        bundling: {
          externalModules: ['aws-sdk']
        }
      })
      usersTable.grantWriteData(postConfirmationHandlerUser);
      postConfirmationHandlerUser.addToRolePolicy(sesStatement);

      const postConfirmationHandlerBusiness = new nodejs.NodejsFunction(this, "my-business-handler",{
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: 'lambda/user/createUserBusiness.ts',
        handler: 'handler',
        environment: {
          TABLE: usersTable.tableName,
          ROLE:'business',
          EMAIL_SENDER:`no-reply@${props.authDomain}.${DOMAIN}`
        },
        bundling: {
          externalModules: ['aws-sdk']
        }
      })
      usersTable.grantWriteData(postConfirmationHandlerBusiness);
      postConfirmationHandlerBusiness.addToRolePolicy(sesStatement);

      // userPool - Customers
      const userPool_Customer = new cognito.UserPool(this, 'userPool_Customer', {
        userPoolName: 'myRewardsUsers',
        selfSignUpEnabled: true,
        signInAliases: {email: true,},
        autoVerify: { email: true },
        standardAttributes: {
          email: { required: true, mutable: true },
          birthdate:{ required: false, mutable: true },
          givenName:{ required: true, mutable: true },
          familyName:{ required: true, mutable: true },
        },
        passwordPolicy: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
        },
        lambdaTriggers:{
          postConfirmation: postConfirmationHandlerUser
        },
        email: cognito.UserPoolEmail.withSES({
          sesRegion: props.env?.region || 'us-east-1',
          fromEmail: `no-reply@${props.authDomain}.${DOMAIN}`,
          fromName: 'MyRewards',
          sesVerifiedDomain: `${props.authDomain}.${DOMAIN}`,
        }),
        userVerification: {
          emailSubject: 'MyRewards Verification',
          emailBody: verifyEmailBody,
          emailStyle: cognito.VerificationEmailStyle.CODE, 
        },
        removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      });

      // userPool - Business
      const userPool_Business = new cognito.UserPool(this, 'userPool_Business', {
        userPoolName: 'myRewardsBusiness',
        selfSignUpEnabled: true,
        signInAliases: {email: true,},
        autoVerify:{email:true},
        standardAttributes: {
          email: { required: true, mutable: true },
          birthdate:{ required: false, mutable: true },
          givenName:{ required: true, mutable: true },
          familyName:{ required: true, mutable: true },
        },
        customAttributes: {
          role: new cognito.StringAttribute({ mutable: true }),
          linked: new cognito.NumberAttribute({ mutable: true })
        },
        passwordPolicy: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
        },
        lambdaTriggers:{
          postConfirmation: postConfirmationHandlerBusiness,
        },
        email: cognito.UserPoolEmail.withSES({
          sesRegion: props.env?.region || 'us-east-1',
          fromEmail: `no-reply@${props.authDomain}.${DOMAIN}`,
          fromName: 'MyRewards',
          sesVerifiedDomain: `${props.authDomain}.${DOMAIN}`,
        }),
        userVerification: {
          emailSubject: 'MyRewards Verification',
          emailBody: verifyEmailBody,
          emailStyle: cognito.VerificationEmailStyle.CODE, 
        },
        removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
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
            email: { required: true, mutable: true },
        },
        customAttributes: {
          role: new cognito.StringAttribute({ mutable: true })
        },
        passwordPolicy: {
            minLength: 8,
            requireLowercase: true,
            requireUppercase: true,
        },
        removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      });
      
      // userPool Client - Customers
      const userPoolClient_Customer = new cognito.UserPoolClient(this, 'userPoolClient_Customer', {
          userPoolClientName:`${props.stageName}-mobileUserPoolClient`,
          userPool:userPool_Customer,
          generateSecret: false,
          supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.GOOGLE],
          authFlows: {
            userPassword: true,
            userSrp: true,
          },
          oAuth: {
            flows: {
              authorizationCodeGrant: true,
            },
            callbackUrls: ['exp://127.0.0.1:19000/--/'],
            logoutUrls: ['exp://127.0.0.1:19000/--/'],
          }
        });

      // userPool Client - Business
      const userPoolClient_Business = new cognito.UserPoolClient(this, 'userPoolClient_Business', {
        userPoolClientName:`${props.stageName}-BusinessUserPoolClient`,
        userPool:userPool_Business,
        generateSecret: false,
        supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.GOOGLE],
        authFlows: {
          userPassword: true,
          userSrp: true,
        },
        oAuth: {
          flows: {
            authorizationCodeGrant: true,
          },
          callbackUrls: [`https://${props.businessDomain}.${DOMAIN}/`, 'http://localhost:3000/'],
          logoutUrls: [`https://${props.businessDomain}.${DOMAIN}/`, 'http://localhost:3000/'],
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
      const identityPool_Users = new cognito.CfnIdentityPool(this, 'myRewards_IdentityPool_User', {
        allowUnauthenticatedIdentities: true,
        cognitoIdentityProviders: [
          {
            clientId: userPoolClient_Customer.userPoolClientId,
            providerName: userPool_Customer.userPoolProviderName,
          }
        ],
      });

      const identityPool_Business = new cognito.CfnIdentityPool(this, 'myRewards_IdentityPool_Business', {
        allowUnauthenticatedIdentities: true,
        cognitoIdentityProviders: [
          {
            clientId: userPoolClient_Business.userPoolClientId,
            providerName: userPool_Business.userPoolProviderName,
          }
        ],
      });

      // Authenticated Role for User (aka Customer)
      const authenticatedPolicy_User = new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: [
              'execute-api:Invoke',
            ],
            resources: [`arn:aws:execute-api:${this.region}:${props.env?.account}:*`], 
          }),
        ],
      });
        
      const unauthenticatedPolicy_User = new iam.PolicyDocument({
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

      const unauthenticatedRole_User = new iam.Role(this, 'UnauthenticatedRole_User', {
          assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
            'StringEquals': { 'cognito-identity.amazonaws.com:aud': identityPool_Users.ref },
            'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'unauthenticated' }
          }, 'sts:AssumeRoleWithWebIdentity'),
          inlinePolicies: {
              'unauthenticatedPolicy': unauthenticatedPolicy_User,
          },
      });

      const authenticatedRole_User = new iam.Role(this, 'AuthenticatedRole_User', {
          assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
            'StringEquals': { 'cognito-identity.amazonaws.com:aud': identityPool_Users.ref },
            'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' }
          }, 'sts:AssumeRoleWithWebIdentity'),
          inlinePolicies: {
              'authenticatedPolicy': authenticatedPolicy_User,
          },
      });

      const appConfigPolicy = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'appconfig:GetConfiguration',
          'appconfig:StartConfigurationSession',
          'appconfig:GetLatestConfiguration'
        ],
        resources: [
        "arn:aws:appconfig:us-east-1:050451385382:application/6hq9cal/environment/1yh2vb8/configuration/9pmpwp2",
        ]
      });
      
      authenticatedRole_User.addToPolicy(appConfigPolicy);
      unauthenticatedRole_User.addToPolicy(appConfigPolicy); 

      // Authenticated Role for Business
      const authenticatedPolicy_Business = new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: [
              'execute-api:Invoke',
            ],
            resources: [`arn:aws:execute-api:${this.region}:${props.env?.account}:*`], 
          }),
        ],
      });
        
      const unauthenticatedPolicy_Business = new iam.PolicyDocument({
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
      
      const unauthenticatedRole_Business = new iam.Role(this, 'UnauthenticatedRole_Business', {
        assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
          'StringEquals': { 'cognito-identity.amazonaws.com:aud': identityPool_Business.ref },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'unauthenticated' }
        }, 'sts:AssumeRoleWithWebIdentity'),
        inlinePolicies: {
            'unauthenticatedPolicy': unauthenticatedPolicy_Business,
        },
    });

      const authenticatedRole_Business = new iam.Role(this, 'AuthenticatedRole_Business', {
          assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
            'StringEquals': { 'cognito-identity.amazonaws.com:aud': identityPool_Business.ref },
            'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' }
          }, 'sts:AssumeRoleWithWebIdentity'),
          inlinePolicies: {
              'authenticatedPolicy': authenticatedPolicy_Business,
          },
      });

      // Google Authentication option
      const secretData =  secretsmanager.Secret.fromSecretNameV2(this, 'GoogleAPI', 'google/api');

      const googleClient = secretData.secretValueFromJson('client_id');
      const googleClientSecret = secretData.secretValueFromJson('client_secret');
      const clientValue = googleClient.unsafeUnwrap(); 
      
      const googleProviderCustomer = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
        userPool: userPool_Customer,
        clientId: clientValue,
        clientSecretValue: googleClientSecret,
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
          birthdate: cognito.ProviderAttribute.GOOGLE_BIRTHDAYS,
          emailVerified: cognito.ProviderAttribute.GOOGLE_EMAIL_VERIFIED
        },
      });

      const googleProviderBusiness = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider_Business', {
        userPool: userPool_Business,
        clientId: clientValue,
        clientSecretValue: googleClientSecret,
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
          birthdate: cognito.ProviderAttribute.GOOGLE_BIRTHDAYS,
          emailVerified: cognito.ProviderAttribute.GOOGLE_EMAIL_VERIFIED
        },
      });
      
      // Register the identity provider with the user pool
      userPoolClient_Customer.node.addDependency(googleProviderCustomer);
      userPool_Customer.registerIdentityProvider(googleProviderCustomer);
      userPoolClient_Business.node.addDependency(googleProviderBusiness);
      userPool_Business.registerIdentityProvider(googleProviderBusiness);

      // attach roles to cognito User+Business
      new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment_User', {
          identityPoolId: identityPool_Users.ref,
          roles: {
          'authenticated': authenticatedRole_User.roleArn,
          'unauthenticated': unauthenticatedRole_User.roleArn,
          }
      });
      new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment_Business', {
        identityPoolId: identityPool_Business.ref,
        roles: {
        'authenticated': authenticatedRole_Business.roleArn,
        'unauthenticated': unauthenticatedRole_Business.roleArn,
        }
      });

      // Custom Userpool Domain Configuration for Users
      const hostedZoneIdAuth = cdk.Fn.importValue(`${props.stageName}-Auth-HostedZoneId`);
      const hostedZoneAuth = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZoneAuth', {
        hostedZoneId: hostedZoneIdAuth,
        zoneName: `${props.authDomain}.${DOMAIN}`,
      });

      const certificateAuth = new acm.Certificate(this, 'AuthCertificate', {
        domainName: `${props.authDomain}.${DOMAIN}`,
        subjectAlternativeNames:[
          `user.${props.authDomain}.${DOMAIN}`,
          `business.${props.authDomain}.${DOMAIN}`
        ],
        validation: acm.CertificateValidation.fromDns(hostedZoneAuth),
      });
  
      const cognitoDomainUser = userPool_Customer.addDomain('addingCustomerDomain', {
        customDomain: {
          domainName: `user.${props.authDomain}.${DOMAIN}`,
          certificate: certificateAuth
        },
      });
      const cognitoDomainBusiness = userPool_Business.addDomain('addingBusinessDomain', {
        customDomain: {
          domainName: `business.${props.authDomain}.${DOMAIN}`,
          certificate: certificateAuth
        },
      });

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
      new cdk.CfnOutput(this, IDENTITY_POOL_CUSTOMER, {
        value: identityPool_Users.attrId,
        description: 'The ID of the Cognito IdentityPool',
        exportName: IDENTITY_POOL_CUSTOMER
      });
      new cdk.CfnOutput(this, IDENTITY_POOL_BUSINESS, {
        value: identityPool_Business.attrId,
        description: 'The ID of the Cognito IdentityPool',
        exportName: IDENTITY_POOL_BUSINESS
      });

      new cdk.CfnOutput(this, AUTHENTICATED_ROLE, {
        value: authenticatedRole_User.roleArn,
        description: 'ARN of authenticated Role',
        exportName: AUTHENTICATED_ROLE
      });

      new cdk.CfnOutput(this, AUTHENTICATED_ROLE_BUSINESS, {
        value: authenticatedRole_Business.roleArn,
        description: 'ARN of authenticated Role Business',
        exportName: AUTHENTICATED_ROLE_BUSINESS
      });
    }
}