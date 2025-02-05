import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { UP_BUSINESS_ID } from '../../../global/constants';
import * as iam from 'aws-cdk-lib/aws-iam';

interface UsersApiStackProps extends cdk.NestedStackProps {
  api: apigateway.RestApi;
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
}

export class ShopApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: UsersApiStackProps) {
    super(scope, id, props);

    const shopTable = dynamodb.Table.fromTableArn(this, 'ImportedShopTableARN', cdk.Fn.importValue('ShopTableARN'));
    
    const createShopLambda = new nodejs.NodejsFunction(this, "my-handler",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/shop/newShop.ts',
      handler: 'handler',
      environment: {
        SHOPS_TABLE: shopTable.tableName,
      },
      bundling: {
        externalModules: ['aws-sdk'],
      },
    })

    shopTable.grantReadData(createShopLambda);

    // API Gateway integration
    const shopApi = props.api.root.addResource('shop'); 

    const createShop = new apigateway.LambdaIntegration(createShopLambda);

    shopApi.addMethod('POST', createShop, {
        authorizer: props.authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}
