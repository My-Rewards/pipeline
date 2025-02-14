import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HostedZoneProps } from '../../global/props';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { AWS_CENTRAL_ACCOUNT, AWS_REGION, DOMAIN } from '../../global/constants';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export class HostedZoneStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props:HostedZoneProps) {
        super(scope, id, props);

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
            zoneName: `${props.apiDomain}.${DOMAIN}`
        });

        const hostedZoneBusiness = new route53.HostedZone(this, 'HostedZoneBusiness', {
            zoneName: `${props.businessDomain}.${DOMAIN}`
        });

        const hostedZoneAuth = new route53.HostedZone(this, 'HostedZoneAuth', {
            zoneName: `${props.authDomain}.${DOMAIN}`
        });

        const hostedZoneImages = new route53.HostedZone(this, 'HostedZoneImages', {
            zoneName: `${props.imageDomain}.${DOMAIN}`
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

        new route53.CrossAccountZoneDelegationRecord(this, 'delegateHostedZoneAuthentication', {
            delegatedZone: hostedZoneAuth,
            parentHostedZoneId: parentHostedZoneId,
            delegationRole: delegationRole
        });

        new route53.CrossAccountZoneDelegationRecord(this, 'delegateHostedZoneImages', {
            delegatedZone: hostedZoneImages,
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

        new cdk.CfnOutput(this, `${props.stageName}-Auth-HostedZoneId`, {
            value: hostedZoneAuth.hostedZoneId,
            description: 'Hosted Zone ID',
            exportName: `${props.stageName}-Auth-HostedZoneId`,
        });

        new cdk.CfnOutput(this, `${props.stageName}-Image-HostedZoneId`, {
            value: hostedZoneImages.hostedZoneId,
            description: 'Hosted Zone ID',
            exportName: `${props.stageName}-Image-HostedZoneId`,
        });
    }
}
