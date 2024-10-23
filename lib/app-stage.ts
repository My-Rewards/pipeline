import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import {amplifyStack} from './Stacks/amplify-stack'
import { DynamoStack } from './Stacks/dynamo-stack';
import { ApiGatewayStack } from './Stacks/apiGateway-stack';
import { userPoolStack } from './Stacks/userPool-stack';
import { SSMStack } from './Stacks/ssm-stack';

// .addDependency() - to ensure a stack is deployed in sequintial order

export class PipelineAppStage extends cdk.Stage {

    constructor(scope: Construct, id: string, props: cdk.StageProps) {
      super(scope, id, props);

      let hostedZoneProp = this.createDefaultProps(props, this.stageName);
      /*
       route53 hosted Zone domain HERE
       REMOVE THIS COMMENT to get started
      */

      let sesProp = this.createDefaultProps(props, this.stageName);
      /* 
       setup SES for sending authentication emails HERE
       REMOVE THIS COMMENT to get started
      */

      let dynamoDbProp = this.createDefaultProps(props, this.stageName);
      const dynamo_stack = new DynamoStack(this, 'Dynamo-Stack', dynamoDbProp);

      let userPoolProps = this.createDefaultProps(props, this.stageName);
      const userPool_stack = new userPoolStack(this, 'UserPool-Stack', userPoolProps);
      userPool_stack.addDependency(dynamo_stack);

      let apiGatewayProps = this.createDefaultProps(props, this.stageName);
      const apiGateway_stack = new ApiGatewayStack(this, 'ApiGateway-Stack', apiGatewayProps);
      apiGateway_stack.addDependency(userPool_stack);

      let amplifyProp = this.createDefaultProps(props, this.stageName);
      const amplify_stack = new amplifyStack(this, 'Amplify-Stack', amplifyProp);
      amplify_stack.addDependency(apiGateway_stack);

    // Create CloudWatch Stack HERE

    // Create Codepipeline Stack to serve build artifact to s3 bucket HERE

    // Create CloudFront Stack for hosting website HERE

      let ssmProps = this.createDefaultProps(props, this.stageName);
      const ssm_Stack = new SSMStack(this, 'Ssm-Stack', ssmProps);
      ssm_Stack.addDependency(amplify_stack);

    }

    createDefaultProps(props:cdk.StageProps, stage:string){
      return{
          env: {
              account: props.env?.account,
              region: props.env?.region
          },
          stageName: stage
      }
  }
}