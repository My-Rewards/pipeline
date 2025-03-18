import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'

interface UsersApiStackProps extends cdk.NestedStackProps {
  api: apigateway.RestApi;
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
}

export class UsersApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: UsersApiStackProps) {
    super(scope, id, props);

    const usersTable = dynamodb.Table.fromTableArn(this, 'ImportedUsersTable', cdk.Fn.importValue('UserTableARN'));
    const orgTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTableARN', cdk.Fn.importValue('OrganizationTableARN'));
    
    // Get Customer Account
    const getCustomerAccountLambda = new nodejs.NodejsFunction(this, "Get-Customer-User",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/user/getUser.ts',
      handler: 'handler',
      environment: {
        USERS_TABLE: usersTable.tableName,
      },
      bundling: {
        externalModules: ['aws-sdk'],
      },
    });

    //Update Customer Account
    const updateCustomerAccountLambda = new nodejs.NodejsFunction(this, "Update-Customer-User",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/user/updateUser.ts',
      handler: 'handler',
      environment: {
        USERS_TABLE: usersTable.tableName,
      },
      bundling: {
        externalModules: ['aws-sdk'],
      },
    });
    //Delete Customer Account
    const deleteCustomerAccountLambda = new nodejs.NodejsFunction(this, "Delete-Customer-User",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/user/deleteUser.ts',
      handler: 'handler',
      environment: {
        USERS_TABLE: usersTable.tableName,
      },
      bundling: {
        externalModules: ['aws-sdk'],
      },
    });
    
    usersTable.grantReadWriteData(getCustomerAccountLambda);
    usersTable.grantReadWriteData(updateCustomerAccountLambda);
    usersTable.grantReadWriteData(deleteCustomerAccountLambda);

    // API Gateway integration
    const customer = props.api.root.addResource('customer'); 
    const usersApi = customer.addResource('user'); 

    const getCustomerUserIntegration = new apigateway.LambdaIntegration(getCustomerAccountLambda);
    const updateCustomerUserIntegration = new apigateway.LambdaIntegration(updateCustomerAccountLambda);
    const deleteCustomerUserIntegration = new apigateway.LambdaIntegration(deleteCustomerAccountLambda);

    usersApi.addMethod('GET', getCustomerUserIntegration, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    usersApi.addMethod('DELETE', getCustomerUserIntegration, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    usersApi.addMethod('PUT', getCustomerUserIntegration, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

  }
}
