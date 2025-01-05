import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

interface UsersApiStackProps extends cdk.NestedStackProps {
  api: apigateway.RestApi;
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer
}

export class UsersApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: UsersApiStackProps) {
    super(scope, id, props);

    const usersTable = dynamodb.Table.fromTableArn(this, 'ImportedUsersTable', cdk.Fn.importValue('UserTableARN'));
    
    const getUserLambda = new lambda.Function(this, 'GetUserLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'getUser.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        USERS_TABLE: usersTable.tableName,
      },
    });

    const createUserLambda = new lambda.Function(this, 'CreateUserLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'createUser.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        USERS_TABLE: usersTable.tableName,
      },
    });

    // Grant permissions
    usersTable.grantReadData(getUserLambda);
    usersTable.grantWriteData(createUserLambda);

    // API Gateway integration
    const usersApi = props.api.root.addResource('user'); 

    // Lambda Functions
    const getUserIntegration = new apigateway.LambdaIntegration(getUserLambda);
    const createUserIntegration = new apigateway.LambdaIntegration(createUserLambda);

    // Adding Lambda Functions to Methods
    usersApi.addMethod('GET', getUserIntegration, {
        authorizer: props.authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    usersApi.addMethod('POST', createUserIntegration, {
        authorizer: props.authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}
