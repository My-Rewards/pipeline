import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as kms from 'aws-cdk-lib/aws-kms';

interface UsersApiStackProps extends cdk.NestedStackProps {
  api: apigateway.RestApi;
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
  encryptionKey: kms.Key;
}

export class OrgApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: UsersApiStackProps) {
    super(scope, id, props);

    const orgTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTableARN', cdk.Fn.importValue('OrganizationTableARN'));
    const userTable = dynamodb.Table.fromTableArn(this, 'ImportedUserTableARN', cdk.Fn.importValue('UserTableARN'));

    const stripeData = cdk.aws_secretsmanager.Secret.fromSecretNameV2(this, 'fetchStripeCredentials', 'stripe/credentials');

    const ImageDomain = cdk.Fn.importValue('ImageDomain');
    const ImageBucketName = cdk.Fn.importValue('OrganizationImageBucket');

    const createOrgLambda = new nodejs.NodejsFunction(this, "my-handler",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/newOrganization.ts',
      handler: 'handler',
      environment: {
        ORG_TABLE: orgTable.tableName,
        USER_TABLE: userTable.tableName,
        BUCKET_NAME: ImageBucketName,
        IMAGE_DOMAIN: ImageDomain,
        STRIPE_ARN: stripeData.secretArn
    },
      bundling: {
        externalModules: ['aws-sdk', 'stripe'],
      },
    })

    orgTable.grantReadData(createOrgLambda);
    stripeData.grantRead(createOrgLambda)

    const orgApi = props.api.root.addResource('shop'); 

    const createOrg = new apigateway.LambdaIntegration(createOrgLambda);

    orgApi.addMethod('POST', createOrg, {
        authorizer: props.authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}
