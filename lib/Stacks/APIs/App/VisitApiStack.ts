import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as kms from "aws-cdk-lib/aws-kms";

interface VisitsApiStackProps extends cdk.NestedStackProps {
  appRoot:  cdk.aws_apigateway.Resource
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
  encryptionKey: kms.IKey;
}

export class VisitsApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: VisitsApiStackProps) {
    super(scope, id, props);

    const visitsTable = dynamodb.Table.fromTableArn(this, 'ImportedVisitsTable', cdk.Fn.importValue('VisitTableARN'));
    const shopsTable = dynamodb.Table.fromTableArn(this, 'ImportedShopsTable', cdk.Fn.importValue('ShopTableARN'));
    const organizationsTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTable', cdk.Fn.importValue('OrganizationTableARN'));
    const plansTable = dynamodb.Table.fromTableArn(this, 'ImportedPlansTable', cdk.Fn.importValue('PlanTableARN'));
    
    const getVisitLambda = new nodejs.NodejsFunction(this, "get-visit-handler",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/visit/getVisit.ts',
      handler: 'handler',
      environment: {
        VISITS_TABLE: visitsTable.tableName,
      },
      bundling: {
        externalModules: ['aws-sdk'],
      },
    })

    const recordVisitLambda = new nodejs.NodejsFunction(this, "record-visit-handler",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/visit/recordVisit.ts',
      handler: 'handler',
      environment: {
        VISITS_TABLE: visitsTable.tableName,
        SHOPS_TABLE: shopsTable.tableName,
        ORGANIZATIONS_TABLE: organizationsTable.tableName,
        PLANS_TABLE: plansTable.tableName,
        APP_ENV: process.env.APP_ENV || 'dev',
      },
      bundling: {
        externalModules: ['aws-sdk'],
        nodeModules: ['square']
      },
    })

    // Grant permissions
    visitsTable.grantReadData(getVisitLambda);
    visitsTable.grantWriteData(recordVisitLambda);
    shopsTable.grantReadData(recordVisitLambda);
    organizationsTable.grantReadData(recordVisitLambda);
    plansTable.grantReadWriteData(recordVisitLambda);
    props.encryptionKey.grantDecrypt(recordVisitLambda);

    // API Gateway integration
    const visitsApi = props.appRoot.addResource('visit');
    const getVisitIntegration = new apigateway.LambdaIntegration(getVisitLambda);
    const recordVisitIntegration = new apigateway.LambdaIntegration(recordVisitLambda);

    visitsApi.addMethod('GET', getVisitIntegration, {
        authorizer: props.authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    visitsApi.addMethod('POST', recordVisitIntegration, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}
