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
    CUSTOMER_DOMAIN,
    BUSINESS_DOMAIN,
    ADMIN_DOMAIN,
    UP_ADMIN_ID,
    UPC_ADMIN,
    DOMAIN,
    IDENTITY_POOL_CUSTOMER,
    IDENTITY_POOL_BUSINESS,
 } from '../../global/constants';
import { UserPoolStackProps } from '../../global/props';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class UserPoolStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: UserPoolStackProps) {
      super(scope, id, props);

      const usersTable = dynamodb.Table.fromTableArn(this, 'ImportedUsersTable', cdk.Fn.importValue('UserTableARN'));
     
      const postConfirmationHandlerUser = new lambda.Function(this, 'PostConfirmationHandlerUser', {

        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'createUser.handler',
        code: lambda.Code.fromAsset('lambda'),
        environment: {
          USERS_TABLE: usersTable.tableName,
          ROLE:'user'
        },
      });
      usersTable.grantWriteData(postConfirmationHandlerUser);

      const postConfirmationHandlerBusiness = new lambda.Function(this, 'PostConfirmationHandlerBusiness', {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'createUserBusiness.handler',
        code: lambda.Code.fromAsset('lambda'),
        environment: {
          USERS_TABLE: usersTable.tableName,
          ROLE:'business'
        },
      });
      usersTable.grantWriteData(postConfirmationHandlerBusiness);

      // userPool - Customers
      const userPool_Customer = new cognito.UserPool(this, 'userPool_Customer', {
        userPoolName: 'myRewardsUsers',
        selfSignUpEnabled: true,
        signInAliases: {
          email: true,
        },
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
          postConfirmation: postConfirmationHandlerBusiness
        },
        removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
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
          email: { required: true, mutable: true },
          birthdate:{ required: false, mutable: true },
          givenName:{ required: true, mutable: true },
          familyName:{ required: true, mutable: true },
      },
        customAttributes: {
          role: new cognito.StringAttribute({ mutable: true })
        },
        passwordPolicy: {
            minLength: 8,
            requireLowercase: true,
            requireUppercase: true,
        },
        lambdaTriggers:{
          postConfirmation: postConfirmationHandlerUser
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

      // cognito Domain - Customer
      const cognitoDomain_Customer = new cognito.UserPoolDomain(this, 'CognitoDomain_Customer', {
          userPool:userPool_Customer,
          cognitoDomain: {
            domainPrefix: `${props.stageName}-customer`,
          },
      });

      // cognito Domain - Business
      const cognitoDomain_Business = new cognito.UserPoolDomain(this, 'CognitoDomain_Business', {
        userPool:userPool_Business,
        cognitoDomain: {
          domainPrefix: `${props.stageName}-business`,
        },
      });

      // cognito Domain - Admin
      const cognitoDomain_Admin = new cognito.UserPoolDomain(this, 'CognitoDomain_Admin', {
        userPool:userPool_Admin,
        cognitoDomain: {
          domainPrefix: `${props.stageName}-admin`,
        },
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
            clientId: userPoolClient_Customer.userPoolClientId,
            providerName: userPool_Customer.userPoolProviderName,
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
      const googleClientSecret = secretsmanager.Secret.fromSecretNameV2(this, 'GoogleClientSecret', 'googleSecret').secretValue;
      const googleClient = secretsmanager.Secret.fromSecretNameV2(this, 'GoogleClientId', 'googleClient');
      
      const clientValue = googleClient.secretValue.unsafeUnwrap(); 
      
      const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
        userPool: userPool_Customer,
        clientId:clientValue,
        clientSecretValue: googleClientSecret,
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
          birthdate: cognito.ProviderAttribute.GOOGLE_BIRTHDAYS
        },
      });
      
      // Register the identity provider with the user pool
      userPoolClient_Customer.node.addDependency(googleProvider);
      userPool_Customer.registerIdentityProvider(googleProvider);
      userPoolClient_Business.node.addDependency(googleProvider);
      userPool_Business.registerIdentityProvider(googleProvider);

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

      const aRecord = new route53.ARecord(this, `${props.stageName}-AuthARecord-Parent`, {
        zone: hostedZoneAuth,
        target: route53.RecordTarget.fromAlias(new targets.UserPoolDomainTarget(cognitoDomain_Customer)),
        deleteExisting: true,
      });
      const aRecordUser = new route53.ARecord(this, `${props.stageName}-User-AuthARecord`, {
        zone: hostedZoneAuth,
        recordName:'user',
        target: route53.RecordTarget.fromAlias(new targets.UserPoolDomainTarget(cognitoDomain_Customer)),
        deleteExisting: true,
      });
      const aRecordBusiness = new route53.ARecord(this, `${props.stageName}-Business-AuthARecord`, {
        zone: hostedZoneAuth,
        recordName:'business',
        target: route53.RecordTarget.fromAlias(new targets.UserPoolDomainTarget(cognitoDomain_Business)),
        deleteExisting: true,
      });

      aRecordUser.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);
      aRecordBusiness.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);

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

      cognitoDomainUser.node.addDependency(aRecord)
      cognitoDomainUser.node.addDependency(aRecordUser)
      cognitoDomainBusiness.node.addDependency(aRecord)
      cognitoDomainBusiness.node.addDependency(aRecordBusiness)


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
      
    }
}