import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { PipelineStack } from '../lib/pipeline-stack';

describe('PipelineStack', () => {
  test('Stack should have a pipeline and associated resources', () => {
    const app = new cdk.App();

    const stack = new PipelineStack(app, 'PipelineStackTest', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });

    app.synth();

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Name: 'MyRewards',
    });

    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRole',
            Principal: {
              Service: 'codepipeline.amazonaws.com',
            },
          }),
        ]),
      },
    });

    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: Match.arrayWith([
        Match.objectLike({ Name: 'central' }),
        Match.objectLike({ Name: 'beta' }),
        Match.objectLike({ Name: 'prod' }),
      ]),
    });

    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: Match.arrayWith([
        Match.objectLike({
          Name: 'prod',
          Actions: Match.arrayWith([
            Match.objectLike({
              Name: 'ManualApprovalBeforeProd',
              ActionTypeId: {
                Category: 'Approval',
              },
            }),
          ]),
        }),
      ]),
    });
  });
});
