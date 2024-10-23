import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import {amplifyStack} from './Stacks/amplify-stack'
import { DynamoStack } from './Stacks/dynamo-stack';
import { ApiGatewayStack } from './Stacks/apiGateway-stack';
import { userPoolStack } from './Stacks/userPool-stack';

export class PipelineAppStage extends cdk.Stage {

    constructor(scope: Construct, id: string, props: cdk.StageProps) {
      super(scope, id, props);

      // route53 hosted Zone domain
      let hostedZoneProp = this.createDefaultProps(props, this.stageName);

      // setup SES for sending authentication emails
      let sesProp = this.createDefaultProps(props, this.stageName);

      let dynamoDbProp = this.createDefaultProps(props, this.stageName);
      const dynamo_stack = new DynamoStack(this, 'Dynamo-Stack', dynamoDbProp);

      let userPoolProps = this.createDefaultProps(props, this.stageName);
      const userPool_stack = new userPoolStack(this, 'userPool-Stack', userPoolProps);

      let apiGatewayProps = this.createApiProps(props, this.stageName, dynamo_stack, userPool_stack);
      const apiGateway_stack = new ApiGatewayStack(this, 'ApiGateway-Stack', apiGatewayProps);

      let amplifyProp = this.createAmplifyProps(props, this.stageName, userPool_stack);
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

    createAmplifyProps(props:cdk.StageProps, stage:string, userPool_stack:userPoolStack){
        return{
            env: {
                account: props.env?.account,
                region: props.env?.region
            },
            stageName: props.stageName,
            authenticatedRole: userPool_stack.authenticatedRole
          }
    }

    createApiProps(props:cdk.StageProps, stage:string, dynamo_stack:DynamoStack, userPool_stack:userPoolStack){
      return{
          env: {
              account: props.env?.account,
              region: props.env?.region
          },
          stageName: props.stageName,
          database: dynamo_stack,
          userPool: userPool_stack.userPool,
          authenticatedRole: userPool_stack.authenticatedRole
      }
  }

}