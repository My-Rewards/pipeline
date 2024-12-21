import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import {amplifyStack} from './Stacks/amplify-stack'
import { DynamoStack } from './Stacks/dynamo-stack';
import { ApiGatewayStack } from './Stacks/apiGateway-stack';
import { UserPoolStack } from './Stacks/userPool-stack';
import { SSMStack } from './Stacks/ssm-stack';
import { WebsiteStack } from './Stacks/website-stack';
import { StackProps, StageProps } from '../global/props';
import { HostedZoneStack } from './Stacks/hostedZone-stack';

export class PipelineAppStage extends cdk.Stage {
    constructor(scope: Construct, id: string, props: StageProps) {
      super(scope, id, props);

      let hostedZoneProps = this.createDefaultProps(props, this.stageName);
      const hostedZone_stack = new HostedZoneStack(this, 'HostedZone-Stack', hostedZoneProps);

      let dynamoDbProp = this.createDefaultProps(props, this.stageName);
      const dynamo_stack = new DynamoStack(this, 'Dynamo-Stack', dynamoDbProp);

      let userPoolProps = this.createDefaultProps(props, this.stageName);
      const userPool_stack = new UserPoolStack(this, 'UserPool-Stack', userPoolProps);
      userPool_stack.addDependency(dynamo_stack);

      let apiGatewayProps = this.createDefaultProps(props, this.stageName);
      const apiGateway_stack = new ApiGatewayStack(this, 'ApiGateway-Stack', apiGatewayProps);
      apiGateway_stack.addDependency(userPool_stack);
      apiGateway_stack.addDependency(hostedZone_stack);

      let amplifyProp = this.createDefaultProps(props, this.stageName);
      const amplify_stack = new amplifyStack(this, 'Amplify-Stack', amplifyProp);
      amplify_stack.addDependency(apiGateway_stack);

      let ssmProps = this.createDefaultProps(props, this.stageName);
      const ssm_Stack = new SSMStack(this, 'Ssm-Stack', ssmProps);
      ssm_Stack.addDependency(amplify_stack);

      let mainWebsiteProps = this.mainWebsiteProps(props, this.stageName);
      const website_stack = new WebsiteStack(this, "Website-Stack", mainWebsiteProps)
      website_stack.addDependency(ssm_Stack);
    }

  createDefaultProps(props:StageProps, stage:string):StackProps{
    return{
        env: {
            account: props.env?.account,
            region: props.env?.region
        },
        stageName: stage,
        subDomain:props.subDomain
    }
  }

  mainWebsiteProps(props:StageProps, stage:string){
    return{
      env: {
          account: props.env?.account,
          region: props.env?.region
      },
      stageName: stage,
      subDomain:props.subDomain,
      githubOwner: 'My-Rewards',
      githubRepo: 'my-rewards-website',
      githubBranch: stage,
      buildCommand: 'npm run build'
    }
  }
}