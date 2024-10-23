import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import { amplifyProps } from '../../global/props';

export class amplifyStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: amplifyProps) {
        super(scope, id, props);

      // Create lambda trigger to add user to right database (business or customer)
      // based on attribute

      const amplifyApp = new amplify.CfnApp(this, `myRewards-${props?.stackName}`, {
          name: 'myRewards',
          iamServiceRole: props.authenticatedRole.roleArn,
      });

      new cdk.CfnOutput(this, 'AmplifyAppId', {
          value: amplifyApp.attrAppId,
          description: 'The ID of the Amplify app',
      });
    }
}
