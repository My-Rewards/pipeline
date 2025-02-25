import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { ApiStackProps } from '../../global/props';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { DOMAIN, UP_BUSINESS_ID, UP_CUSTOMER_ID } from '../../global/constants';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { UsersApiStack } from './APIs/UserApiStack';
import { SquareApiStack } from './APIs/SquareApiStack';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { BusinessApiStack } from './APIs/BusinessApiStack';
import { OrgApiStack } from './APIs/OrganizationApiStack';
import { ShopApiStack } from './APIs/ShopsApiStack';

export class ApiGatewayStack extends cdk.Stack {
  public readonly encryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const hostedZoneId = cdk.Fn.importValue(`${props.stageName}-API-HostedZoneId`);

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: hostedZoneId,
      zoneName: `${props.apiDomain}.${DOMAIN}`,
    });

    const certificate = new acm.Certificate(this, 'Certificate', {
        domainName:`${props.apiDomain}.${DOMAIN}`,
        validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    this.encryptionKey = new kms.Key(this, 'KMSEncryptionKey', {
      enableKeyRotation: true,
      description: 'KMS Key for encrypting token data for database',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolId = cdk.Fn.importValue(UP_CUSTOMER_ID);
    const bizzUserPoolId = cdk.Fn.importValue(UP_BUSINESS_ID);

    const userPool = cognito.UserPool.fromUserPoolId(this, 'ImportedUserPoolUser', userPoolId);
    const bizzUserPool = cognito.UserPool.fromUserPoolId(this, 'ImportedUserPoolBizz', bizzUserPoolId);

    const authorizerUser = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizerUser', {
      cognitoUserPools: [userPool],
    });

    const authorizerBizz = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizerBizz', {
      cognitoUserPools: [bizzUserPool],
    });

    // Create Custom Domain API
    const api = new apigateway.RestApi(this, 'myRewardsApi', {
        restApiName: 'myRewards API',
        description: 'This is an API for Lambda functions.',
        domainName: {
          domainName: `${props.apiDomain}.${DOMAIN}`,
          certificate: certificate,
          endpointType: apigateway.EndpointType.EDGE,
          securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
        },
        defaultCorsPreflightOptions: {
          allowOrigins: apigateway.Cors.ALL_ORIGINS,
          allowMethods: apigateway.Cors.ALL_METHODS,
          allowHeaders: apigateway.Cors.DEFAULT_HEADERS
        }
    });

    new route53.ARecord(this, 'ApiARecord', {
      zone: hostedZone,
      recordName: `${props.apiDomain}.${DOMAIN}`,
      target: route53.RecordTarget.fromAlias( new targets.ApiGateway(api))
    });

    new UsersApiStack(this, 'UsersApiStack', {
      api: api,
      authorizer:authorizerUser,
    });

    new BusinessApiStack(this, 'BusinessApiStack', {
      api: api,
      authorizer:authorizerBizz,
    });

    new SquareApiStack(this, 'SquareApiStack', {
      api: api,
      authorizer:authorizerBizz,
      encryptionKey:this.encryptionKey,
      stage:props.stageName!
    });

    new OrgApiStack(this, 'OrgApiStack', {
      api: api,
      authorizer:authorizerBizz,
      encryptionKey:this.encryptionKey,
    });

    new ShopApiStack(this, 'OrgApiStack', {
      api: api,
      authorizer:authorizerBizz,
      encryptionKey:this.encryptionKey,
    });




    // Additional API resources (e.g., Shops, Organizations) can follow the same pattern
  }
}