import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { GenericStackProps } from '../../global/props';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class CloudWatchStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GenericStackProps) {
    super(scope, id, props);

    const orgTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTableARN', cdk.Fn.importValue('OrganizationTableARN'));
    const kmsKey = cdk.aws_kms.Key.fromKeyArn(this, 'ImportedKMSKey', cdk.Fn.importValue('kmsARN'));

    const secretData = cdk.aws_secretsmanager.Secret.fromSecretNameV2(this, 'fetchSquareSecret', 'square/credentials');

    const lambdaFunction = new nodejs.NodejsFunction(this, "cloudWatch-square-token-updater",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/cloudWatch/squareTokenUpdater.ts',
      handler: 'handler',
      environment: {
        ORG_TABLE: orgTable.tableName,
        KMS_KEY: kmsKey.keyId,
        APP_ENV: props.stageName,
        SQUARE_ARN: secretData.secretArn,
      },
      bundling: {
        externalModules: ['aws-sdk'],
        nodeModules: ['square']
      },
      timeout: cdk.Duration.minutes(3)
    })
    orgTable.grantReadWriteData(lambdaFunction);
    secretData.grantRead(lambdaFunction);
    kmsKey.grantEncryptDecrypt(lambdaFunction);

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