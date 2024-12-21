import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackProps } from '../../global/props';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { AWS_CENTRAL_ACCOUNT, AWS_REGION, DOMAIN } from '../../global/constants';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export class HostedZoneStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        let businessDomain;
        if(props.stageName === 'beta'){
            businessDomain=`${props.stageName}.business.${DOMAIN}`;
        }else{
            businessDomain=`business.${DOMAIN}`;
        }

        const delegationRoleARN = ssm.StringParameter.fromStringParameterArn(this, 
            'HostedZoneARN', 
            `arn:aws:ssm:${AWS_REGION}:${AWS_CENTRAL_ACCOUNT}:parameter/myRewards/hostedZoneARN`).stringValue;
            
        const parentHostedZoneId = ssm.StringParameter.fromStringParameterArn(this, 
            'HostedZoneID', 
            `arn:aws:ssm:${AWS_REGION}:${AWS_CENTRAL_ACCOUNT}:parameter/myRewards/hostedZoneID`).stringValue;
      
        const delegationRole = iam.Role.fromRoleArn(this, 'delegationRole', delegationRoleARN);

        const hostedZone = new route53.HostedZone(this, 'HostedZoneWebsite', {
            zoneName: `${props.subDomain}.${DOMAIN}`
        });

        const hostedZoneAPI = new route53.HostedZone(this, 'HostedZoneAPI', {
            zoneName: `${props.subDomain}-api.${DOMAIN}`
        });

        const hostedZoneBusiness = new route53.HostedZone(this, 'HostedZoneBusiness', {
            zoneName: businessDomain
        });

        new route53.CrossAccountZoneDelegationRecord(this, 'delegateHostedZone', {
            delegatedZone: hostedZone,
            parentHostedZoneId: parentHostedZoneId,
            delegationRole: delegationRole
        });

        new route53.CrossAccountZoneDelegationRecord(this, 'delegateHostedZoneAPI', {
            delegatedZone: hostedZoneAPI,
            parentHostedZoneId: parentHostedZoneId,
            delegationRole: delegationRole
        });

        new route53.CrossAccountZoneDelegationRecord(this, 'delegateHostedZoneBusiness', {
            delegatedZone: hostedZoneBusiness,
            parentHostedZoneId: parentHostedZoneId,
            delegationRole: delegationRole
        });

        new cdk.CfnOutput(this, `${props.stageName}-HostedZoneId`, {
            value: hostedZone.hostedZoneId,
            description: 'Hosted Zone ID',
            exportName: `${props.stageName}-HostedZoneId`,
        });
        
        new cdk.CfnOutput(this, `${props.stageName}-API-HostedZoneId`, {
            value: hostedZoneAPI.hostedZoneId,
            description: 'Hosted Zone ID',
            exportName: `${props.stageName}-API-HostedZoneId`,
        });

        new cdk.CfnOutput(this, `${props.stageName}-Business-HostedZoneId`, {
            value: hostedZoneBusiness.hostedZoneId,
            description: 'Hosted Zone ID',
            exportName: `${props.stageName}-Business-HostedZoneId`,
        });
    }
}
