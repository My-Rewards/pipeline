import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { ApiStackProps } from '../../global/props';
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