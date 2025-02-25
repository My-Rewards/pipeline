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

export class BusinessApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: UsersApiStackProps) {
    super(scope, id, props);

    const usersTable = dynamodb.Table.fromTableArn(this, 'ImportedUsersTable', cdk.Fn.importValue('UserTableARN'));
    
    const getUserLambda = new nodejs.NodejsFunction(this, "my-handler",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/user/getUser.ts',
      handler: 'handler',
      environment: {
        USERS_TABLE: usersTable.tableName,
      },
      bundling: {
        externalModules: ['aws-sdk'],
      },
    })  

    usersTable.grantReadData(getUserLambda);

    // API Gateway integration
    const businessapi = props.api.root.addResource('business'); 
    const usersApi = businessapi.addResource('user'); 

    const getUserIntegration = new apigateway.LambdaIntegration(getUserLambda);

    usersApi.addMethod('GET', getUserIntegration, {
        authorizer: props.authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}
