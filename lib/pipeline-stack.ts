import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ManualApprovalStep, ShellStep } from 'aws-cdk-lib/pipelines';
import { PipelineAppStage } from './app-stage';
import { PipelineCentralStage } from './central-stage';
import { AWS_BETA_ACCOUNT, AWS_CENTRAL_ACCOUNT, AWS_PROD_ACCOUNT, AWS_REGION } from '../global/constants';

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'MyRewards',
      crossAccountKeys: true, 
      selfMutation:true,
      synth: new ShellStep('Synth', {
        input: CodePipelineSource.gitHub('My-Rewards/pipeline', 'main', {
          authentication: cdk.SecretValue.secretsManager('github-token'),
        }),
        commands: ['npm ci', 'npm run build', 'npx cdk synth']
      })
    });

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

    pipeline.addStage(new PipelineCentralStage(this, "central", {
      env: { account: AWS_CENTRAL_ACCOUNT, region: AWS_REGION },
      stageName: 'central'
     }));

    pipeline.buildPipeline();
  }
}