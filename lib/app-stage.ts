import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import {amplifyStack} from './amplify-stack'

export class PipelineAppStage extends cdk.Stage {

    constructor(scope: Construct, id: string, props: cdk.StageProps) {
      super(scope, id, props);

      // fix this
      // Stacks
      const amplify_stack = new amplifyStack(this, 'Amplify-Stack', {
        env: {
            account: props.env?.account,  // Uses the account from the stage props
            region: props.env?.region  // Uses the region from the stage props
        },
        stageName: props.stageName // Passing the stage name (e.g., "beta", "prod") as the stageName
    });
    }
}