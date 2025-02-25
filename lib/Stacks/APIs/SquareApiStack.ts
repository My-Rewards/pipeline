import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as kms from 'aws-cdk-lib/aws-kms';

interface SquareApiStackProps extends cdk.NestedStackProps {
  api: apigateway.RestApi;
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer
  encryptionKey: kms.Key;
  stage: string;
}

export class SquareApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: SquareApiStackProps) {
    super(scope, id, props);

    const usersTable = dynamodb.Table.fromTableArn(this, 'ImportedUsersTable', cdk.Fn.importValue('UserTableARN'));

    // Get square credemtials
    const secretData = cdk.aws_secretsmanager.Secret.fromSecretNameV2(this, 'fetchSquareSecret', 'square/credentials');
    const client_id = secretData.secretValueFromJson('client_id').unsafeUnwrap();
    const client_secret = secretData.secretValueFromJson('client_secret').unsafeUnwrap();
    
    if(!client_id || !client_secret){
      throw Error('Missing client secret or Id')
    }

    const setupSquareLambda = new nodejs.NodejsFunction(this, "my-handler",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/square/connectSquare.ts',
      handler: 'handler',
      environment: {
        USERS_TABLE: usersTable.tableName,
        SQUARE_CLIENT:client_id,
        SQUARE_SECRET:client_secret,
        KMS_KEY_ID: props.encryptionKey.keyId,
        ENV:props.stage
      },
      bundling: {
        externalModules: ['aws-sdk'],
        nodeModules: ['square'],
      },
      timeout: cdk.Duration.seconds(10),
    })

    usersTable.grantReadData(setupSquareLambda);
    usersTable.grantWriteData(setupSquareLambda);
    props.encryptionKey.grantEncryptDecrypt(setupSquareLambda);

    const listMerchantsLambda = new nodejs.NodejsFunction(this, "my-handler",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/square/listMerchants.ts',
      handler: 'handler',
      environment: {
        USERS_TABLE: usersTable.tableName,
        SQUARE_CLIENT:client_id,
        SQUARE_SECRET:client_secret,
        KMS_KEY_ID: props.encryptionKey.keyId,
        ENV:props.stage
      },
      bundling: {
        externalModules: ['aws-sdk'],
        nodeModules: ['square'],
      },
      timeout: cdk.Duration.seconds(10),
    })

    usersTable.grantReadData(listMerchantsLambda);
    usersTable.grantWriteData(listMerchantsLambda);
    props.encryptionKey.grantEncryptDecrypt(listMerchantsLambda);

    const squareApi = props.api.root.addResource('square'); 
    const connectApi = squareApi.api.root.addResource('connect'); 
    const listMerchants = squareApi.api.root.addResource('listMerchants'); 

    const setupLambdaIntegration = new apigateway.LambdaIntegration(setupSquareLambda);
    const merchantsLambdaIntegration = new apigateway.LambdaIntegration(listMerchantsLambda);

    connectApi.addMethod('POST', setupLambdaIntegration, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    listMerchants.addMethod('GET', merchantsLambdaIntegration, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}
