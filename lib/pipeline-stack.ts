import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ManualApprovalStep, ShellStep } from 'aws-cdk-lib/pipelines';
import { PipelineAppStage } from './app-stage';
import { PipelineCentralStage } from './central-stage';
import { 
  AWS_BETA_ACCOUNT, 
  AWS_CENTRAL_ACCOUNT, 
  AWS_PROD_ACCOUNT, 
  AWS_REGION, 
  GITHUB_ARN 
} from '../global/constants';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Variable } from 'aws-cdk-lib/aws-codepipeline';

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipelineRole = new iam.Role(this, 'PipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });

    pipelineRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        "codeconnections:GetConnection",
        "codeconnections:UseConnection",
        "codeconnections:GetRepositorySyncStatus",
        "codeconnections:GetSyncConfiguration",
        "codeconnections:GetConnectionToken",
        "codeconnections:GetHost",
        "codeconnections:StartOAuthHandshake",
        "codeconnections:PassRepository",
        "codeconnections:UseConnection",
        "codebuild:BatchPutCodeCoverages",
				"codebuild:BatchPutTestCases",
				"codebuild:CreateReport",
				"codebuild:CreateReportGroup",
				"codebuild:UpdateReport",
        "s3:Abort*",
				"s3:DeleteObject*",
				"s3:GetBucket*",
				"s3:GetObject*",
				"s3:List*",
				"s3:PutObject",
				"s3:PutObjectLegalHold",
				"s3:PutObjectRetention",
				"s3:PutObjectTagging",
				"s3:PutObjectVersionTagging",
        "kms:Decrypt",
				"kms:DescribeKey",
				"kms:Encrypt",
				"kms:GenerateDataKey*",
				"kms:ReEncrypt*",
        "logs:CreateLogGroup",
				"logs:CreateLogStream",
				"logs:PutLogEvents"
      ],
      resources: [
        'arn:aws:us-east-1:724772076019:*',
      ],
    }));

    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'MyRewards',
      crossAccountKeys: true, 
      selfMutation:true,
      role:pipelineRole,
      synth: new ShellStep('Synth', {
        input: CodePipelineSource.connection('My-Rewards/pipeline', 'main', {
          connectionArn: GITHUB_ARN,
          triggerOnPush: true,
        }),
        commands: [
          'npm ci',
          'npm run build',
          'npx cdk synth'
        ],
      })
    });

    pipeline.addStage(new PipelineCentralStage(this, "central", {
      env: { account: AWS_CENTRAL_ACCOUNT, region: AWS_REGION },
      stageName: 'central'
     }));

    pipeline.addStage(new PipelineAppStage(this, "beta", {
      env: { account: AWS_BETA_ACCOUNT, region: AWS_REGION },
      stageName: 'beta',
      subDomain: 'beta'
    }));

    pipeline.addStage(new PipelineAppStage(this, "prod", {
      env: { account: AWS_PROD_ACCOUNT, region: AWS_REGION },
      stageName: 'prod',
      subDomain: 'www'
    }), {
      pre: [
        new ManualApprovalStep('ManualApprovalBeforeProd')
      ]
    });
  }
}