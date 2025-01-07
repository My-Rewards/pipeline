import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

interface SquareApiStackProps extends cdk.NestedStackProps {
  api: apigateway.RestApi;
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer
}

export class SquareApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: SquareApiStackProps) {
    super(scope, id, props);

    const usersTable = dynamodb.Table.fromTableArn(this, 'ImportedUsersTable', cdk.Fn.importValue('UserTableARN'));

    const setupSquareLambda = new lambda.Function(this, 'CreateUserLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'SqaureApiStack.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        USERS_TABLE: usersTable.tableName,
      },
    });

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
