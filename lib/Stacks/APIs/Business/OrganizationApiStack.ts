import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as iam from 'aws-cdk-lib/aws-iam';
import { AUTHENTICATED_ROLE_BUSINESS, METER_PRICE } from '../../../../global/constants';

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
    const ImageBucketARN = cdk.Fn.importValue('OrganizationImageBucketARN');

    // Create ORG Lambda
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
    createOrgLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [    
          "s3:GetObject",
          "s3:PutObject",
          "s3:GetObjectVersion"
        ],
        resources: [`${ImageBucketARN}/*`],
      })
    );

    // Get Org Lambda
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

    // Get Org Billing
    const getBillingLambda = new nodejs.NodejsFunction(this, "get-organization-billing",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/getBilling.ts',
      handler: 'handler',
      environment: {
        ORG_TABLE: orgTable.tableName,
        USER_TABLE: userTable.tableName,
        STRIPE_ARN: stripeData.secretArn
      },
      bundling: {
        externalModules: ['aws-sdk'],
        nodeModules: ['stripe']
      },
    })
    orgTable.grantReadData(getBillingLambda);
    userTable.grantReadData(getBillingLambda);
    stripeData.grantRead(getBillingLambda);

    // addPayment Lambda
    const addPaymentLambda = new nodejs.NodejsFunction(this, "organization-addPayment",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/addPayment.ts',
      handler: 'handler',
      environment: {
        ORG_TABLE: orgTable.tableName,
        USER_TABLE: userTable.tableName,
        STRIPE_ARN: stripeData.secretArn,
      },
      bundling: {
        externalModules: ['aws-sdk'],
        nodeModules: ['stripe']
      },
    })
    orgTable.grantReadData(addPaymentLambda);
    userTable.grantReadData(addPaymentLambda);
    stripeData.grantRead(addPaymentLambda);

    // addPayment Lambda
    const setDefaultPaymentLambda = new nodejs.NodejsFunction(this, "organization-setDefaultPayment",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/setDefaultPayment.ts',
      handler: 'handler',
      environment: {
        ORG_TABLE: orgTable.tableName,
        USER_TABLE: userTable.tableName,
        STRIPE_ARN: stripeData.secretArn,
        METER_PRICE: METER_PRICE
      },
      bundling: {
        externalModules: ['aws-sdk'],
        nodeModules: ['stripe']
      },
    })
    orgTable.grantReadData(setDefaultPaymentLambda);
    userTable.grantReadData(setDefaultPaymentLambda);
    stripeData.grantRead(setDefaultPaymentLambda);

    // removePayment Lambda
    const removePaymentLambda = new nodejs.NodejsFunction(this, "organization-removePayment",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/removePayment.ts',
      handler: 'handler',
      environment: {
        ORG_TABLE: orgTable.tableName,
        USER_TABLE: userTable.tableName,
        STRIPE_ARN: stripeData.secretArn,
      },
      bundling: {
        externalModules: ['aws-sdk'],
        nodeModules: ['stripe']
      },
    })
    orgTable.grantReadData(removePaymentLambda);
    userTable.grantReadData(removePaymentLambda);
    stripeData.grantRead(removePaymentLambda);

    const orgApi = props.api.root.addResource('org'); 
    
    // Sub Paths
    const createOrg = orgApi.addResource('create'); 
    const getOrg = orgApi.addResource('details'); 
    const getBilling = orgApi.addResource('billing'); 
    const addPayment = orgApi.addResource('addPayment'); 
    const setDefaultPayment = orgApi.addResource('setDefaultPayment'); 
    const removePayment = orgApi.addResource('removePayment'); 

    // API-Gateway lambda Integration
    const createOrgMethod = new apigateway.LambdaIntegration(createOrgLambda);
    const getOrgMethod = new apigateway.LambdaIntegration(getOrgLambda);
    const getBillingMethod = new apigateway.LambdaIntegration(getBillingLambda);
    const addPaymentMethod = new apigateway.LambdaIntegration(addPaymentLambda);
    const setDefaultPaymentMethod = new apigateway.LambdaIntegration(setDefaultPaymentLambda);
    const removePaymentMethod = new apigateway.LambdaIntegration(removePaymentLambda);

    // API-Gateway Path Integration
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
    addPayment.addMethod('PUT', addPaymentMethod, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    setDefaultPayment.addMethod('PUT', setDefaultPaymentMethod, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    removePayment.addMethod('DELETE', removePaymentMethod, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

  }
}
