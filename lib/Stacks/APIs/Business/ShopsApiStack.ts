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
  encryptionKey: kms.IKey;
}

export class ShopApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: UsersApiStackProps) {
    super(scope, id, props);

    const shopTable = dynamodb.Table.fromTableArn(this, 'ImportedShopTableARN', cdk.Fn.importValue('ShopTableARN'));
    const orgTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTableARN', cdk.Fn.importValue('OrganizationTableARN'));
    const userTable = dynamodb.Table.fromTableArn(this, 'ImportedBizzUsersTable', cdk.Fn.importValue('BizzUserTableARN'));

    const createShopLambda = new nodejs.NodejsFunction(this, "my-handler",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/shop/newShop.ts',
      handler: 'handler',
      environment: {
        SHOP_TABLE: shopTable.tableName,
        USER_TABLE: userTable.tableName,
        ORG_TABLE: orgTable.tableName
      },
      bundling: {
        externalModules: ['aws-sdk'],
      },
    })

    shopTable.grantReadWriteData(createShopLambda);
    orgTable.grantReadData(createShopLambda);
    userTable.grantReadData(createShopLambda);
    props.encryptionKey.grantEncryptDecrypt(createShopLambda);

    // API Gateway integration
    const shopApi = props.api.root.addResource('shops'); 
    const createShopApi = shopApi.addResource('create'); 

    const createShop = new apigateway.LambdaIntegration(createShopLambda);

    createShopApi.addMethod('POST', createShop, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}
