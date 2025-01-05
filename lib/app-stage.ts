import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import { AmplifyStack } from './Stacks/amplify-stack'
import { DynamoStack } from './Stacks/dynamo-stack';
import { ApiGatewayStack } from './Stacks/apiGateway-stack';
import { UserPoolStack } from './Stacks/userPool-stack';
import { SSMStack } from './Stacks/ssm-stack';
import { WebsiteStack } from './Stacks/website-stack';
import { 
  AmplifyStackProps,
  ApiStackProps,
  DynamoStackProps, 
  HostedZoneProps, 
  SSMStackProps, 
  StageProps, 
  UserPoolStackProps, 
  WebsiteStackProps 
} from '../global/props';
import { HostedZoneStack } from './Stacks/hostedZone-stack';

export class PipelineAppStage extends cdk.Stage {
    constructor(scope: Construct, id: string, props: StageProps) {
      super(scope, id, props);

      let businessDomain;
      let apiDomain;
      let authDomain;

      if(props.stageName === 'beta'){
          businessDomain=`${props.stageName}.business`;
          authDomain=`${props.stageName}.auth`;
          apiDomain=`${props.stageName}.api`;

      }else{
          businessDomain=`business`;
          authDomain=`auth`;
          apiDomain=`api`;
      }

      let hostedZoneProps = this.createHostedZoneProps(props, this.stageName, authDomain, businessDomain, apiDomain);
      const hostedZone_stack = new HostedZoneStack(this, 'HostedZone-Stack', hostedZoneProps);

      let dynamoDbProp = this.createDynamoProps(props, this.stageName);
      const dynamo_stack = new DynamoStack(this, 'Dynamo-Stack', dynamoDbProp);

      let userPoolProps = this.createUserPoolProps(props, this.stageName, authDomain);
      const userPool_stack = new UserPoolStack(this, 'UserPool-Stack', userPoolProps);
      userPool_stack.addDependency(dynamo_stack);

      let apiGatewayProps = this.createApiProps(props, this.stageName, apiDomain);
      const apiGateway_stack = new ApiGatewayStack(this, 'ApiGateway-Stack', apiGatewayProps);
      apiGateway_stack.addDependency(userPool_stack);
      apiGateway_stack.addDependency(hostedZone_stack);

      let amplifyProp = this.createAmplifyProps(props, this.stageName);
      const amplify_stack = new AmplifyStack(this, 'Amplify-Stack', amplifyProp);
      amplify_stack.addDependency(apiGateway_stack);

      let ssmProps = this.createSSMProps(props, this.stageName);
      const ssm_Stack = new SSMStack(this, 'Ssm-Stack', ssmProps);
      ssm_Stack.addDependency(amplify_stack);

      let mainWebsiteProps = this.mainWebsiteProps(props, this.stageName, authDomain);
      const website_stack = new WebsiteStack(this, "Website-Stack", mainWebsiteProps)
      website_stack.addDependency(ssm_Stack);

      // Add Bizz Website Here
      // business_Website_Stack.addDependency(ssm_Stack);

      // Create new Prop Creater for Stack(ie createHostedZoneProps, createDynamoProps...)
    }

  createHostedZoneProps(props:StageProps, stage:string, authDomain:string, businessDomain:string, apiDomain:string):HostedZoneProps{
    return{
      env: {
          account: props.env?.account,
          region: props.env?.region
      },
      stageName: stage,
      subDomain:props.subDomain,
      authDomain,
      businessDomain,
      apiDomain
    }
  }

  createDynamoProps(props:StageProps, stage:string):DynamoStackProps{
    return{
        env: {
            account: props.env?.account,
            region: props.env?.region
        },
        stageName: stage
    }
  }

  createUserPoolProps(props:StageProps, stage:string, authDomain:string):UserPoolStackProps{
    return{
        env: {
            account: props.env?.account,
            region: props.env?.region
        },
        stageName: stage,
        authDomain,
    }
  }

  createApiProps(props:StageProps, stage:string, apiDomain:string):ApiStackProps{
    return{
        env: {
            account: props.env?.account,
            region: props.env?.region
        },
        stageName: stage,
        subDomain:props.subDomain,
        apiDomain
    }
  }

  createAmplifyProps(props:StageProps, stage:string):AmplifyStackProps{
    return{
        env: {
            account: props.env?.account,
            region: props.env?.region
        },
        stageName: stage
    }
  }

  createSSMProps(props:StageProps, stage:string):SSMStackProps{
    return{
        env: {
            account: props.env?.account,
            region: props.env?.region
        },
        stageName: stage
    }
  }

  mainWebsiteProps(props:StageProps, stage:string, authDomain:string):WebsiteStackProps{
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
      buildCommand: 'npm run build',
      authDomain, 
    }
  }
}