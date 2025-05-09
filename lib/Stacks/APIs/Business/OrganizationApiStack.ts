import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as iam from 'aws-cdk-lib/aws-iam';
import {DATABASE_NAME, METER_PRICE} from '../../../../global/constants';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import {getAuroraAccess} from "../../util/aurora-access";

interface OrgApiStackProps extends cdk.NestedStackProps {
  api: apigateway.RestApi;
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
  stageName:string;
}

export class OrgApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: OrgApiStackProps) {
    super(scope, id, props);

    const orgTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTableARN', cdk.Fn.importValue('OrganizationTableARN'));
    const userTable = dynamodb.Table.fromTableArn(this, 'ImportedBizzUsersTable', cdk.Fn.importValue('BizzUserTableARN'));
    const shopTable = dynamodb.Table.fromTableArn(this, 'ImportedShopsTableARN', cdk.Fn.importValue('ShopTableARN'));

    const stripeData = cdk.aws_secretsmanager.Secret.fromSecretNameV2(this, 'fetchStripeCredentials', 'stripe/credentials');

    const ImageDomain = cdk.Fn.importValue('ImageDomain');
    const ImageBucketName = cdk.Fn.importValue('OrganizationImageBucket');
    const ImageBucketARN = cdk.Fn.importValue('OrganizationImageBucketARN');
    const ImageCloudfrontId = cdk.Fn.importValue('ImageCloudfrontId');

    const { vpc, clusterSecret, clusterArn, clusterRole, securityGroupResolvers } = getAuroraAccess(this, id, props.stageName);

    // Create ORG Lambda
    const createOrgLambda = new nodejs.NodejsFunction(this, "create-organization",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/newOrganization.ts',
      functionName:'Create-Organization',
      timeout:cdk.Duration.seconds(5),
      handler: 'handler',
      role:clusterRole,
      securityGroups:[securityGroupResolvers],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      vpc,
      environment: {
        ORG_TABLE: orgTable.tableName,
        USER_TABLE: userTable.tableName,
        BUCKET_NAME: ImageBucketName,
        IMAGE_DOMAIN: ImageDomain,
        STRIPE_ARN: stripeData.secretArn,
        CLUSTER_SECRET_ARN: clusterSecret.secretArn,
        CLUSTER_ARN: clusterArn,
        DB_NAME: DATABASE_NAME
    },
      bundling: {
        nodeModules: ['stripe', 'aws-sdk']
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
          "s3:GetObjectVersion",
        ],
        resources: [`${ImageBucketARN}/*`],
      })
    );
    clusterSecret.grantRead(createOrgLambda);

    // Get Org Lambda
    const getOrgLambda = new nodejs.NodejsFunction(this, "get-organization",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/getOrg.ts',
      functionName:'Get-Organization',
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
      functionName:'Get-Organization-Billing',
      environment: {
        ORG_TABLE: orgTable.tableName,
        USER_TABLE: userTable.tableName,
        STRIPE_ARN: stripeData.secretArn
      },
      bundling: {
        nodeModules: ['stripe', 'aws-sdk']
      },
    })
    orgTable.grantReadData(getBillingLambda);
    userTable.grantReadData(getBillingLambda);
    stripeData.grantRead(getBillingLambda);

    // addPayment Lambda
    const addPaymentLambda = new nodejs.NodejsFunction(this, "organization-addPayment",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/addPayment.ts',
      functionName:'Add-Organization-Payment',
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
      functionName:'Set-Organization-Default-Payment',
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
      functionName:'Remove-Organization-Payment',
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
    orgTable.grantReadWriteData(removePaymentLambda);
    userTable.grantReadData(removePaymentLambda);
    stripeData.grantRead(removePaymentLambda);

    // Update Organization Lambda
    const updateOrgDetailsLambda = new nodejs.NodejsFunction(this, "organization-update-details",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/update/data.ts',
      handler: 'handler',
      functionName:'Update-Organization-Details',
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
    orgTable.grantReadWriteData(updateOrgDetailsLambda);
    userTable.grantReadData(updateOrgDetailsLambda);
    stripeData.grantRead(updateOrgDetailsLambda);

    // Update Organization Lambda
    const updateOrgStatusLambda = new nodejs.NodejsFunction(this, "organization-update-status",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/update/status.ts',
      handler: 'handler',
      functionName:'Update-Organization-Status',
      vpc,
      securityGroups: [securityGroupResolvers],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      role:clusterRole,
      environment: {
        ORG_TABLE: orgTable.tableName,
        USER_TABLE: userTable.tableName,
        STRIPE_ARN: stripeData.secretArn,
        CLUSTER_SECRET_ARN: clusterSecret.secretArn,
        CLUSTER_ARN: clusterArn,
        DB_NAME: DATABASE_NAME
      },
      timeout:cdk.Duration.seconds(5),
      bundling: {
        nodeModules: ['stripe', 'aws-sdk']
      },
    })
    orgTable.grantReadWriteData(updateOrgStatusLambda);
    userTable.grantReadData(updateOrgStatusLambda);
    stripeData.grantRead(updateOrgStatusLambda);
    clusterSecret.grantRead(updateOrgStatusLambda);

    // Update Organization Lambda
    const updateOrgImageLambda = new nodejs.NodejsFunction(this, "organization-update-images",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/update/images.ts',
      handler: 'handler',
      functionName:'Update-Organization-Image',
      environment: {
        ORG_TABLE: orgTable.tableName,
        USER_TABLE: userTable.tableName,
        BUCKET_NAME: ImageBucketName,
        CLOUDFRONT_DISTRIBUTION_ID:ImageCloudfrontId
      },
      bundling: {
        externalModules: ['aws-sdk'],
      },
    })
    userTable.grantReadWriteData(updateOrgImageLambda);
    orgTable.grantReadWriteData(updateOrgImageLambda);
    updateOrgImageLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:GetObjectVersion",
          "cloudfront:CreateInvalidation"
        ],
        resources: [
          `${ImageBucketARN}/*`,
          `arn:aws:cloudfront::${this.account}:distribution/${ImageCloudfrontId}`
        ],
      })
    );

    const orgApi = props.api.root.addResource('org');
    const updateOrgApi = orgApi.addResource('update');

    // Sub Paths
    const createOrg = orgApi.addResource('create');
    const getOrg = orgApi.addResource('details');
    const getBilling = orgApi.addResource('billing');
    const addPayment = orgApi.addResource('addPayment');
    const setDefaultPayment = orgApi.addResource('setDefaultPayment');
    const removePayment = orgApi.addResource('removePayment');

    const updateOrg = updateOrgApi.addResource('details');
    const updateImage = updateOrgApi.addResource('image');
    const updateStatus = updateOrgApi.addResource('status');

    // API-Gateway lambda Integration
    const createOrgMethod = new apigateway.LambdaIntegration(createOrgLambda);
    const getOrgMethod = new apigateway.LambdaIntegration(getOrgLambda);
    const getBillingMethod = new apigateway.LambdaIntegration(getBillingLambda);
    const addPaymentMethod = new apigateway.LambdaIntegration(addPaymentLambda);
    const setDefaultPaymentMethod = new apigateway.LambdaIntegration(setDefaultPaymentLambda);
    const removePaymentMethod = new apigateway.LambdaIntegration(removePaymentLambda);
    const updateImageMethod = new apigateway.LambdaIntegration(updateOrgImageLambda);
    const updateDetailsMethod = new apigateway.LambdaIntegration(updateOrgDetailsLambda);
    const updateStatusMethod = new apigateway.LambdaIntegration(updateOrgStatusLambda);
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
    updateImage.addMethod('PUT', updateImageMethod, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    updateOrg.addMethod('PUT', updateDetailsMethod, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    updateStatus.addMethod('PUT', updateStatusMethod, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}
