import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import {amplifyStack} from './Resource Stacks/amplify-stack'
import { DynamoStack } from './Resource Stacks/dynamo-stack';

export class PipelineAppStage extends cdk.Stage {

    constructor(scope: Construct, id: string, props: cdk.StageProps) {
      super(scope, id, props);

    //   need to moidfy amplify once website is to be hosted
      let amplifyProp = this.createProps(props, this.stageName);
      const amplify_stack = new amplifyStack(this, 'Amplify-Stack', amplifyProp);

      let dynamoDbProp = this.createProps(props, this.stageName);
      const dynamo_stack = new DynamoStack(this, 'Dynamo-Stack', amplifyProp);

    // apigateway Stack

    // lambda Stacks

    // s3 bucket for holding website build artifacts

    // CloudFront for hosting website
    }

    createProps(props:cdk.StageProps, stage:string){
        return{
            env: {
                account: props.env?.account,
                region: props.env?.region
            },
            stageName: props.stageName
        }
    }

}