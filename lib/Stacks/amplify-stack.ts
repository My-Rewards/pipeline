import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import { AmplifyStackProps } from '../../global/props';

export class AmplifyStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: AmplifyStackProps) {
      super(scope, id, props);

      const authenticatedRoleARN = cdk.Fn.importValue('AuthenticatedRoleARN');

      const amplifyApp = new amplify.CfnApp(this, `myRewards-${props?.stageName}`, {
          name: 'myRewards',
          iamServiceRole: authenticatedRoleARN,
      });

      new cdk.CfnOutput(this, 'AmplifyAppId', {
          value: amplifyApp.attrAppId,
          description: 'The ID of the Amplify app',
          exportName:'AmplifyAppId'
      });
    }
}
