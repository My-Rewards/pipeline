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

    const userTable = dynamodb.Table.fromTableArn(this, 'ImportedBizzUsersTable', cdk.Fn.importValue('BizzUserTableARN'));
    const orgTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTableARN', cdk.Fn.importValue('OrganizationTableARN'));
    
    // getAccount Lambda
    const getBizzAccountLambda = new nodejs.NodejsFunction(this, "business-get-account",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/getAccount.ts',
      handler: 'handler',
      environment: {
        ORG_TABLE: orgTable.tableName,
        USER_TABLE: orgTable.tableName,
      },
      bundling: {
        externalModules: ['aws-sdk']
      },
    })
    orgTable.grantReadData(getBizzAccountLambda);
    userTable.grantReadData(getBizzAccountLambda);
    
     // updateAccount Lambda
    const updateBizzAccountLambda = new nodejs.NodejsFunction(this, "business-update-account",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/update/account.ts',
      handler: 'handler',
      environment: {
        ORG_TABLE: orgTable.tableName,
        USER_TABLE: orgTable.tableName,
      },
      bundling: {
        externalModules: ['aws-sdk']
      },
    })
    orgTable.grantReadWriteData(updateBizzAccountLambda);
    userTable.grantReadWriteData(updateBizzAccountLambda);

    // API Gateway integration
    const business = props.api.root.addResource('business'); 
    const updateBusinessApi = business.addResource('update'); 
    const getBusinessUser = business.addResource('user');
    const updateBusinessUser = updateBusinessApi.addResource('user');   

    const getBusinessUserMethod = new apigateway.LambdaIntegration(getBizzAccountLambda);
	  const updateBusinessUserMethod = new apigateway.LambdaIntegration(updateBizzAccountLambda);

    getBusinessUser.addMethod('GET', getBusinessUserMethod, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    updateBusinessUser.addMethod('PUT', updateBusinessUserMethod, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

  }
}
