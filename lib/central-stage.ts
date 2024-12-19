import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import { HostedZoneStack } from './Central Stacks/hostedZone-stack';
import { StageProps } from '../global/props';

export class PipelineCentralStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: cdk.StageProps) {
    super(scope, id, props);

    let hostedZoneProp = this.createDefaultProps(props);
    const hostedZone_stack = new HostedZoneStack(this, 'HostedZone-Stack', hostedZoneProp);

  }

  createDefaultProps(props:cdk.StageProps){
    return{
        env: {
            account: props.env?.account,
            region: props.env?.region
        }
      }
  }
}