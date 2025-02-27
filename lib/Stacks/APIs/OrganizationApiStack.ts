import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as iam from 'aws-cdk-lib/aws-iam';

interface OrgApiStackProps extends cdk.NestedStackProps {
  api: apigateway.RestApi;
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
}

export class OrgApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: OrgApiStackProps) {
    super(scope, id, props);

    const orgTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTableARN', cdk.Fn.importValue('OrganizationTableARN'));
    const userTable = dynamodb.Table.fromTableArn(this, 'ImportedUserTableARN', cdk.Fn.importValue('UserTableARN'));
    const shopTable = dynamodb.Table.fromTableArn(this, 'ImportedShopsTableARN', cdk.Fn.importValue('ShopTableARN'));

    const stripeData = cdk.aws_secretsmanager.Secret.fromSecretNameV2(this, 'fetchStripeCredentials', 'stripe/credentials');

    const ImageDomain = cdk.Fn.importValue('ImageDomain');
    const ImageBucketName = cdk.Fn.importValue('OrganizationImageBucket');

    // Lambdas
    const createOrgLambda = new nodejs.NodejsFunction(this, "create-organization",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/newOrganization.ts',
      timeout:cdk.Duration.seconds(5),
      handler: 'handler',
      environment: {
        ORG_TABLE: orgTable.tableName,
        USER_TABLE: userTable.tableName,
        BUCKET_NAME: ImageBucketName,
        IMAGE_DOMAIN: ImageDomain,
        STRIPE_ARN: stripeData.secretArn
    },
      bundling: {
        externalModules: ['aws-sdk'],
        nodeModules: ['stripe'],
      },
    })
    userTable.grantReadWriteData(createOrgLambda);
    orgTable.grantReadWriteData(createOrgLambda);
    stripeData.grantRead(createOrgLambda);

    const getOrgLambda = new nodejs.NodejsFunction(this, "get-organization",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/getOrg.ts',
      timeout:cdk.Duration.seconds(5),
      handler: 'handler',
      environment: {
        ORG_TABLE: orgTable.tableName,
        SHOP_TABLE: shopTable.tableName,
        USER_TABLE: userTable.tableName
      },
      bundling: {
        externalModules: ['aws-sdk']
      },
    })
    orgTable.grantReadData(getOrgLambda);
    shopTable.grantReadData(getOrgLambda);
    userTable.grantReadWriteData(getOrgLambda);
    getOrgLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query"],
        resources: [`${shopTable.tableArn}/index/OrgIndex`]
      })
    );

    const getBillingLambda = new nodejs.NodejsFunction(this, "get-organization-billing",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/getBilling.ts',
      handler: 'handler',
      environment: {
        ORG_TABLE: orgTable.tableName,
      },
      bundling: {
        externalModules: ['aws-sdk']
      },
    })
    orgTable.grantReadWriteData(getBillingLambda);

    const getAccountLambda = new nodejs.NodejsFunction(this, "get-organization-account",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/getBilling.ts',
      handler: 'handler',
      environment: {
        ORG_TABLE: orgTable.tableName,
      },
      bundling: {
        externalModules: ['aws-sdk']
      },
    })
    orgTable.grantReadWriteData(getAccountLambda);

    const orgApi = props.api.root.addResource('orgs'); 
    const createOrg = orgApi.addResource('create'); 
    const getOrg = orgApi.addResource('details'); 
    const getBilling = orgApi.addResource('billing'); 
    const getAccount = orgApi.addResource('account'); 

    // API-Gateway Integration
    const createOrgMethod = new apigateway.LambdaIntegration(createOrgLambda);
    const getOrgMethod = new apigateway.LambdaIntegration(getOrgLambda);
    const getBillingMethod = new apigateway.LambdaIntegration(getBillingLambda);
    const getAccountMethod = new apigateway.LambdaIntegration(getAccountLambda);

    // API-Gateway Path
    createOrg.addMethod('POST', createOrgMethod, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    getOrg.addMethod('GET', getOrgMethod, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    getBilling.addMethod('GET', getBillingMethod, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    getAccount.addMethod('GET', getAccountMethod, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}
