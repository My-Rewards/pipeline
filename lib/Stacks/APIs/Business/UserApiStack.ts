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
    
    // Get Bizz Account
    const getBizzAccountLambda = new nodejs.NodejsFunction(this, "Get-Business-User",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/getBilling.ts',
      handler: 'handler',
      environment: {
        ORG_TABLE: orgTable.tableName,
      },
      bundling: {
        externalModules: ['aws-sdk']
      },
    })
    orgTable.grantReadData(getBizzAccountLambda);
    usersTable.grantReadData(getBizzAccountLambda);

    // API Gateway integration
    const business = props.api.root.addResource('business'); 
    const businessUser = business.addResource('user'); 

    const getBusinessUserIntegration = new apigateway.LambdaIntegration(getBizzAccountLambda);

    businessUser.addMethod('GET', getBusinessUserIntegration, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

  }
}
