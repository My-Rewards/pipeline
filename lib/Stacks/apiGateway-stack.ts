import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { ApiStackProps } from "../../global/props";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { DOMAIN, UP_BUSINESS_ID, UP_CUSTOMER_ID } from "../../global/constants";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { UsersApiStack } from "./APIs/App/UserApiStack";
import { SquareApiStack } from "./APIs/Business/SquareApiStack";
import * as kms from "aws-cdk-lib/aws-kms";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { OrgApiStack } from "./APIs/Business/OrganizationApiStack";
import { ShopApiStack } from "./APIs/Business/ShopsApiStack";
import { UsersApiStack as BusinessApiStack } from "./APIs/Business/UserApiStack";
import { ShopApiStack as AppShopApiStack } from "./APIs/App/ShopsStack";
import {PlansApiStack} from "./APIs/App/PlansApiStack";
import {VisitsApiStack} from "./APIs/App/VisitApiStack";
export class ApiGatewayStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const hostedZoneId = cdk.Fn.importValue(
      `${props.stageName}-API-HostedZoneId`
    );

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      {
        hostedZoneId: hostedZoneId,
        zoneName: `${props.apiDomain}.${DOMAIN}`,
      }
    );

    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: `${props.apiDomain}.${DOMAIN}`,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    const encryptionKey = kms.Key.fromKeyArn(this, "ImportedKMSKey", cdk.Fn.importValue('kmsARN'));

    const userPoolId = cdk.Fn.importValue(UP_CUSTOMER_ID);
    const bizzUserPoolId = cdk.Fn.importValue(UP_BUSINESS_ID);

    const userPool = cognito.UserPool.fromUserPoolId(this, "ImportedUserPoolUser", userPoolId);

    const bizzUserPool = cognito.UserPool.fromUserPoolId(this, "ImportedUserPoolBizz", bizzUserPoolId);

    const authorizerUser = new apigateway.CognitoUserPoolsAuthorizer(this, "CognitoAuthorizerUser",
        {
        cognitoUserPools: [userPool],
        }
    );

    const authorizerBizz = new apigateway.CognitoUserPoolsAuthorizer(this, "CognitoAuthorizerBizz",
        {
        cognitoUserPools: [bizzUserPool],
        }
    );

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
        },
        deployOptions: {
            stageName: props.stageName,
            throttlingRateLimit: 20,
            throttlingBurstLimit: 40,
        },
    });

    new route53.ARecord(this, "ApiARecord", {
      zone: hostedZone,
      recordName: `${props.apiDomain}.${DOMAIN}`,
      target: route53.RecordTarget.fromAlias(new targets.ApiGateway(api)),
    });

    const appPath = api.root.addResource('app');

      new UsersApiStack(this, "UsersApiStack", {
          api: api,
          authorizer: authorizerUser,
          stageName: props.stageName,
      });

    new AppShopApiStack(this, "AppShopApiStack", {
        appRoot: appPath,
        authorizer: authorizerUser,
        stageName: props.stageName,
    });

    new VisitsApiStack(this, "AppVisitsApiStack", {
        appRoot: appPath,
        authorizer: authorizerUser,
        encryptionKey: encryptionKey
    });

    new PlansApiStack(this, "AppPlanApiStack", {
        appRoot: appPath,
        authorizer: authorizerUser,
        stageName: props.stageName,
    });
    
    new SquareApiStack(this, "SquareApiStack", {
        api: api,
        authorizer: authorizerBizz,
        encryptionKey: encryptionKey,
        stageName: props.stageName,
    });

    new OrgApiStack(this, "OrgApiStack", {
        api: api,
        authorizer: authorizerBizz,
        stageName: props.stageName,
    });

    new BusinessApiStack(this, "BusinessApiStack", {
        api: api,
        authorizer: authorizerBizz,
    });

    new ShopApiStack(this, "ShopApiStack", {
        api: api,
        authorizer: authorizerBizz,
        encryptionKey: encryptionKey,
        stageName: props.stageName,
    });

    new cdk.CfnOutput(this, 'RestApi', {
        value: api.restApiId,
        description: 'RestApi ID',
        exportName: 'restApi',
    });
  }
}
