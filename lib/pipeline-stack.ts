import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ManualApprovalStep, ShellStep } from 'aws-cdk-lib/pipelines';
import { PipelineAppStage } from './app-stage';
import * as iam from 'aws-cdk-lib/aws-iam';
import { AWS_BETA_ACCOUNT, AWS_PROD_ACCOUNT, AWS_REGION } from '../global/constants';

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'MyRewards',
      crossAccountKeys: true, 
      synth: new ShellStep('Synth', {
        input: CodePipelineSource.gitHub('My-Rewards/pipeline', 'main', {
          authentication: cdk.SecretValue.secretsManager('github-token'),
        }),
        commands: ['npm ci', 'npm run build', 'npx cdk synth']
      })
    });
    
    // beta stage
    pipeline.addStage(new PipelineAppStage(this, "beta",{
      env: { account: AWS_BETA_ACCOUNT, region: AWS_REGION },
      stageName:'beta',
    }));

    // prod stage
    // Add a Manual Approval Step before deploying to prod
    pipeline.addStage(new PipelineAppStage(this, "prod", {
      env: { account: AWS_PROD_ACCOUNT, region: AWS_REGION },
      stageName: 'prod',
    }), {
      pre: [
        new ManualApprovalStep('ManualApprovalBeforeProd')
      ]
    });

    pipeline.buildPipeline();
  }
}