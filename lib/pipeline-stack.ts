import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import { PipelineAppStage } from './app-stage';
import * as iam from 'aws-cdk-lib/aws-iam';

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
      env: { account: '417975668372', region: 'us-east-1' },
      stageName:'beta',
    }));

    // prod stage
    pipeline.addStage(new PipelineAppStage(this, "prod", {
      env: { account: "396608803858", region: "us-east-1" },
      stageName:'prod',
    }));

    pipeline.buildPipeline();
  }
}