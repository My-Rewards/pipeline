import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'

interface UsersApiStackProps extends cdk.NestedStackProps {
  api: apigateway.RestApi;
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
}

export class ShopApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: UsersApiStackProps) {
    super(scope, id, props);

    const orgTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTableARN', cdk.Fn.importValue('OrganizationTableARN'));
    const ImageDomain = cdk.Fn.importValue('ImageDomain');
    const ImageBucketName = cdk.Fn.importValue('OrganizationImageBucket');

    const createOrgLambda = new nodejs.NodejsFunction(this, "my-handler",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/newOrganization.ts',
      handler: 'handler',
      environment: {
        TABLE_NAME: orgTable.tableName,
        BUCKET_NAME: ImageBucketName,
        CUSTOM_DOMAIN: ImageDomain,
    },
      bundling: {
        externalModules: ['aws-sdk', 'stripe'],
      },
    })

    orgTable.grantReadData(createOrgLambda);

    const shopApi = props.api.root.addResource('shop'); 

    const createOrg = new apigateway.LambdaIntegration(createOrgLambda);

    shopApi.addMethod('POST', createOrg, {
        authorizer: props.authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}
