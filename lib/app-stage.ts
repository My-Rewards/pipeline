import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import {amplifyStack} from './Resource Stacks/amplify-stack'
import { DynamoStack } from './Resource Stacks/dynamo-stack';
import { ApiGatewayStack } from './Resource Stacks/apiGateway-stack';


export class PipelineAppStage extends cdk.Stage {

    constructor(scope: Construct, id: string, props: cdk.StageProps) {
      super(scope, id, props);

      let dynamoDbProp = this.createDefaultProps(props, this.stageName);
      const dynamo_stack = new DynamoStack(this, 'Dynamo-Stack', dynamoDbProp);

      let apiGatewayProps = this.createApiProps(props, this.stageName, dynamo_stack);
      const apiGateway_stack = new ApiGatewayStack(this, 'ApiGateway-Stack', apiGatewayProps);

      let amplifyProp = this.createAmplifyProps(props, this.stageName, apiGateway_stack);
      const amplify_stack = new amplifyStack(this, 'Amplify-Stack', amplifyProp);

    // CloudWatch 

    // codepipeline to serve build artifact to s3 bucket

    // CloudFront for hosting website
    }

    createDefaultProps(props:cdk.StageProps, stage:string){
      return{
          env: {
              account: props.env?.account,
              region: props.env?.region
          },
          stageName: props.stageName
      }
  }


    createAmplifyProps(props:cdk.StageProps, stage:string, apiGateway_stack:ApiGatewayStack){
        return{
            env: {
                account: props.env?.account,
                region: props.env?.region
            },
            stageName: props.stageName,
            api:apiGateway_stack
        }
    }

    createApiProps(props:cdk.StageProps, stage:string, dynamo_stack:DynamoStack){
      return{
          env: {
              account: props.env?.account,
              region: props.env?.region
          },
          stageName: props.stageName,
          database:dynamo_stack
      }
  }

}