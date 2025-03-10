import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CloudWatchStackProps } from '../../global/props';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class CloudWatchStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: CloudWatchStackProps) {
    super(scope, id, props);

    const orgTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTableARN', cdk.Fn.importValue('OrganizationTableARN'));
    const stripeData = cdk.aws_secretsmanager.Secret.fromSecretNameV2(this, 'fetchStripeCredentials', 'stripe/credentials');

    const lambdaFunction = new nodejs.NodejsFunction(this, "get-organization-billing",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/cloudWatch/squareTokenUpdater.ts',
      handler: 'handler',
      environment: {
        ORG_TABLE: orgTable.tableName,
        STRIPE_ARN: stripeData.secretArn
      },
      bundling: {
        externalModules: ['aws-sdk'],
        nodeModules: ['stripe']
      },
    })

    const rule = new events.Rule(this, 'DailyTriggerRule', {
      schedule: events.Schedule.expression('cron(59 23 * * ? *)'), 
    });

    rule.addTarget(new targets.LambdaFunction(lambdaFunction));

    lambdaFunction.addPermission('AllowCloudWatchInvoke', {
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: rule.ruleArn,
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: lambdaFunction.functionName,
    });
  }
}