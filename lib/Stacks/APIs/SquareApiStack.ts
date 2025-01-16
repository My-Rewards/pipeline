import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'

interface SquareApiStackProps extends cdk.NestedStackProps {
  api: apigateway.RestApi;
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer
}

export class SquareApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: SquareApiStackProps) {
    super(scope, id, props);

    const usersTable = dynamodb.Table.fromTableArn(this, 'ImportedUsersTable', cdk.Fn.importValue('UserTableARN'));

    // Get square credemtials
    const secretData = cdk.SecretValue.secretsManager('square/credentials');
    const { client_id, client_secret } = secretData.toJSON();

    const setupSquareLambda = new nodejs.NodejsFunction(this, "my-handler",{
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: 'lambda/connectSquare.ts',
        handler: 'connectSquare.handler',
        environment: {
            USERS_TABLE: usersTable.tableName,
            SQUARE_CLIENT:client_id,
            SQUARE_SECRET:client_secret
        },
        bundling: {
            externalModules: ['aws-sdk'],
            nodeModules: ['square'],
        },
    })

    // Grant permissions
    usersTable.grantReadData(setupSquareLambda);
    usersTable.grantWriteData(setupSquareLambda);

    // API Gateway integration
    const squareApi = props.api.root.addResource('square'); 
    const connectApi = squareApi.api.root.addResource('connect'); 

    // Lambda Functions
    const setupLambdaIntegration = new apigateway.LambdaIntegration(setupSquareLambda);

    connectApi.addMethod('POST', setupLambdaIntegration, {
        authorizer: props.authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}
