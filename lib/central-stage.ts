import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import { HostedZoneStack } from './Central Stacks/hostedZone-stack';
import { FargateStack } from './Stacks/ecs-stack';
import { StageProps } from '../global/props';



export class PipelineCentralStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: cdk.StageProps) {
    super(scope, id, props);

    let hostedZoneProp = this.createHostedZoneProps(props);
    const hostedZone_stack = new HostedZoneStack(this, 'HostedZone-Stack', hostedZoneProp);

    let fargateProps = this.createFargateProps(props);
    const fargateStack = new FargateStack(this, 'Fargate-Stack', fargateProps);
  }

  createHostedZoneProps(props:cdk.StageProps):cdk.StackProps{
    return{
        env: {
            account: props.env?.account,
            region: props.env?.region
        }
      }
  }

  createFargateProps(props:cdk.StageProps):cdk.StackProps{
    return{
        env: {
            account: props.env?.account,
            region: props.env?.region
        }
      }
  }
}