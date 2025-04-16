import { CustomEmailStack } from './Stacks/customEmail-stack';
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
    AppConfigStackProps,
    CustomEmailProps,
    DynamoStackProps,
    HostedZoneProps,
    SSMStackProps,
    StageProps,
    UserPoolStackProps,
    WebsiteStackProps,
    BusinessWebsiteStackProps,
    ImageBucketProps,
    AuroraStackProps
} from '@/global/props';
import { HostedZoneStack } from './Stacks/hostedZone-stack';
import { AppConfigStack } from './Stacks/appConfigStack';
import { BusinessWebsiteStack } from './Stacks/business-website-stack';
import { ImageBucketStack } from './Stacks/ImageBucket-stack';
import { CloudWatchStack } from './Stacks/cloudWatch-stack';
import { AuroraStack } from './Stacks/aurora-stack';
import { VpcStack } from './Stacks/vpc-stack';

export class PipelineAppStage extends cdk.Stage {
    constructor(scope: Construct, id: string, props: StageProps) {
        super(scope, id, props);

        let businessDomain;
        let apiDomain;
        let authDomain;
        let imageDomain;

        if(props.stageName === 'beta'){
            businessDomain=`${props.stageName}.business`;
            authDomain=`${props.stageName}.auth`;
            apiDomain=`${props.stageName}.api`;
            imageDomain=`${props.stageName}.assets`;
        }else{
            businessDomain=`business`;
            authDomain=`auth`;
            apiDomain=`api`;
            imageDomain='assets'
        }

        let hostedZoneProps = this.createHostedZoneProps(props, this.stageName, authDomain, businessDomain, apiDomain, imageDomain);
        const hostedZone_stack = new HostedZoneStack(this, 'HostedZone-Stack', hostedZoneProps);
        hostedZone_stack.terminationProtection = true;

        let dynamoDbProp = this.createDynamoProps(props, this.stageName);
        const dynamo_stack = new DynamoStack(this, 'Dynamo-Stack', dynamoDbProp);
        dynamo_stack.terminationProtection = true;

        let vpcStackProps = this.createVpcStackProps(props, this.stageName);
        const vpcStack = new VpcStack(this, 'Vpc-Stack', vpcStackProps);

        let auroraStackProps = this.createAuroraStackProps(props, this.stageName);
        const auroraStack = new AuroraStack(this, 'Aurora-Stack', auroraStackProps);
        auroraStack.terminationProtection = true;
        auroraStack.addDependency(vpcStack);

        let appConfigProps = this.createAppConfigProps(props, this.stageName);
        const appConfigStack = new AppConfigStack(this, 'AppConfig-Stack', appConfigProps);

        let customEmailProps = this.createCustomEmailProps(props, this.stageName, authDomain);
        const customEmail_stack = new CustomEmailStack(this, 'CustomEmail-Stack', customEmailProps);
        customEmail_stack.addDependency(hostedZone_stack);

        let userPoolProps = this.createUserPoolProps(props, this.stageName, authDomain, businessDomain);
        const userPool_stack = new UserPoolStack(this, 'UserPool-Stack', userPoolProps);
        userPool_stack.addDependency(customEmail_stack);
        // userPool_stack.addDependency(dynamo_stack);
        userPool_stack.terminationProtection = true;

        let imageBucketProps = this.createImageBucketProps(props, this.stageName, imageDomain, businessDomain);
        const imageBucket_stack = new ImageBucketStack(this, 'ImageBucket-Stack', imageBucketProps);
        imageBucket_stack.addDependency(userPool_stack);

        let apiGatewayProps = this.createApiProps(props, this.stageName, apiDomain);
        const apiGateway_stack = new ApiGatewayStack(this, 'ApiGateway-Stack', apiGatewayProps);
        apiGateway_stack.addDependency(userPool_stack);
        apiGateway_stack.addDependency(imageBucket_stack);
        apiGateway_stack.addDependency(auroraStack);

        let cloudWatchProp = this.createCloudWatchProps(props, this.stageName);
        const cloudWatchStack = new CloudWatchStack(this, 'CloudWatch-Stack', cloudWatchProp);
        cloudWatchStack.addDependency(apiGateway_stack);

        let amplifyProp = this.createAmplifyProps(props, this.stageName);
        const amplify_stack = new AmplifyStack(this, 'Amplify-Stack', amplifyProp);

        let ssmProps = this.createSSMProps(props, this.stageName);
        const ssm_Stack = new SSMStack(this, 'Ssm-Stack', ssmProps);
        ssm_Stack.addDependency(amplify_stack);

        let mainWebsiteProps = this.mainWebsiteProps(props, this.stageName, authDomain);
        const website_stack = new WebsiteStack(this, "Website-Stack", mainWebsiteProps)
        website_stack.addDependency(ssm_Stack);
        website_stack.addDependency(appConfigStack)

        let mainBusinessWebsiteProps = this.mainBusinessWebsiteProps(props, this.stageName, businessDomain, apiDomain);
        const business_website_stack = new BusinessWebsiteStack(this, "Business-Website-Stack", mainBusinessWebsiteProps);
        business_website_stack.addDependency(ssm_Stack)
        business_website_stack.addDependency(appConfigStack)
    }

    createHostedZoneProps(props:StageProps, stage:string, authDomain:string, businessDomain:string, apiDomain:string, imageDomain:string):HostedZoneProps{
    return{
      env: {
          account: props.env?.account,
          region: props.env?.region
      },
      stageName: stage,
      subDomain:props.subDomain,
      authDomain,
      businessDomain,
      apiDomain,
      imageDomain
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

    createVpcStackProps(props:StageProps, stage:string):AuroraStackProps{
        return{
            env: {
                account: props.env?.account,
                region: props.env?.region
            },
            stageName: stage
        }
    }

    createAuroraStackProps(props:StageProps, stage:string):AuroraStackProps{
        return{
            env: {
                account: props.env?.account,
                region: props.env?.region
            },
                stageName: stage
        }
    }

    createAppConfigProps(props:StageProps, stage:string):AppConfigStackProps{
        return{
            env: {
                account: props.env?.account,
                region: props.env?.region
            },
            stageName: stage
        }
    }

    createImageBucketProps(props:StageProps, stage:string, imageDomain:string, businessDomain:string):ImageBucketProps{
        return{
            env: {
                account: props.env?.account,
                region: props.env?.region
            },
            stageName: stage,
            imageDomain,
            businessDomain
        }
    }

    createCustomEmailProps(props:StageProps, stage:string, authDomain:string):CustomEmailProps{
    return{
        env: {
            account: props.env?.account,
            region: props.env?.region
        },
        stageName: stage,
        authDomain,
    }
    }

    createUserPoolProps(props:StageProps, stage:string, authDomain:string, businessDomain:string):UserPoolStackProps{
    return{
        env: {
            account: props.env?.account,
            region: props.env?.region
        },
        stageName: stage,
        authDomain,
        businessDomain
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

    createCloudWatchProps(props:StageProps, stage:string):SSMStackProps{
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

    mainBusinessWebsiteProps(props:StageProps, stage:string, businessDomain:string, apiDomain:string):BusinessWebsiteStackProps{
    return{
        env: {
            account: props.env?.account,
            region: props.env?.region
        },
        stageName: stage,
        subDomain: businessDomain,
        githubOwner: 'My-Rewards',
        githubRepo: 'bizz-website',
        githubBranch: stage,
        buildCommand: 'npm run build',
        apiDomain
    }
    }
}