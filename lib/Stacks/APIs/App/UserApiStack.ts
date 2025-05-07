import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import {DATABASE_NAME, UP_CUSTOMER_ID} from '../../../../global/constants';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import {getAuroraAccess} from "../../util/aurora-access";

interface UsersApiStackProps extends cdk.NestedStackProps {
  api: apigateway.RestApi;
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
}

export class UsersApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: UsersApiStackProps) {
    super(scope, id, props);

    // Get infrastructure resources using the helper function
    const { vpc, clusterSecret, clusterArn, clusterRole, securityGroupResolvers } = getAuroraAccess(this, id);

    const usersTable = dynamodb.Table.fromTableArn(this, 'ImportedUsersTable', cdk.Fn.importValue('UserTableARN'));
    const orgTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTableARN', cdk.Fn.importValue('OrganizationTableARN'));
    const userPool = cognito.UserPool.fromUserPoolId(this, 'ImportedUserPool', cdk.Fn.importValue(UP_CUSTOMER_ID));

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

    const onboardLambda = new nodejs.NodejsFunction(this, "Onboard-Customer-User",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/user/onboard.ts',
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
        USER_POOL_ID: userPool.userPoolId,
      },
      bundling: {
        externalModules: ['aws-sdk'],
      },
    });

    usersTable.grantReadData(getCustomerAccountLambda);
    usersTable.grantReadWriteData(updateCustomerAccountLambda);
    usersTable.grantReadWriteData(onboardLambda);
    usersTable.grantReadWriteData(deleteCustomerAccountLambda);

    deleteCustomerAccountLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminDeleteUser'],
      resources: [userPool.userPoolArn],
    }));

    //Delete Customer Account
    const setOrgLike = new nodejs.NodejsFunction(this, "Set-Customer-Like",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/like.ts',
      handler: 'handler',
      functionName:'User-Org-Like',
      vpc,
      role: clusterRole,
      securityGroups: [securityGroupResolvers],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      environment: {
        CLUSTER_SECRET_ARN: clusterSecret.secretArn,
        CLUSTER_ARN: clusterArn,
        DB_NAME: DATABASE_NAME
      },
      bundling: {
        externalModules: ['aws-sdk'],
      },
    });

    // API Gateway integration
    const customer = props.api.root.addResource('customer'); 
    const usersApi = customer.addResource('user'); 
    const userDelete = usersApi.addResource('delete');
    const userUpdate = usersApi.addResource('update');
    const onboardingComplete = usersApi.addResource('onboard');
    const orgLike = customer.addResource('like');

    const getCustomerUserIntegration = new apigateway.LambdaIntegration(getCustomerAccountLambda);
    const updateCustomerUserIntegration = new apigateway.LambdaIntegration(updateCustomerAccountLambda);
    const deleteCustomerUserIntegration = new apigateway.LambdaIntegration(deleteCustomerAccountLambda);
    const orgLikeIntegration = new apigateway.LambdaIntegration(setOrgLike);
    const onboardIntegrations = new apigateway.LambdaIntegration(onboardLambda);

    usersApi.addMethod('GET', getCustomerUserIntegration, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    userDelete.addMethod('DELETE', deleteCustomerUserIntegration, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    userUpdate.addMethod('PUT', updateCustomerUserIntegration, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    onboardingComplete.addMethod('PUT', onboardIntegrations, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    orgLike.addMethod('PUT', orgLikeIntegration, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

  }
}
