import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { GenericStackProps} from "../../global/props";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export class VpcStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: GenericStackProps) {
        super(scope, id, props);

        const vpc = new ec2.Vpc(this, 'AuroraVpc', {
            vpcName: `aurora-vpc-${props.stageName}`,
            maxAzs: 2,
            natGateways: 1,
            subnetConfiguration: [
                {
                    subnetType: ec2.SubnetType.PUBLIC,
                    cidrMask: 24,
                    name: 'aurora-public-subnet'
                },
                {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    cidrMask: 24,
                    name: 'aurora-private-subnet'
                },
                {
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                    cidrMask: 24,
                    name: 'aurora-isolated-subnet'
                }
            ]
        });

        vpc.addGatewayEndpoint('DYNAMODB', {
            service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
        });

        new cdk.CfnOutput(this, 'ClusterVPC_Id', {
            value: vpc.vpcId,
            description: 'Cluster VPC ID',
            exportName: `ClusterVPC-Id`,
        });

        vpc.isolatedSubnets.forEach((subnet, index) => {
            new cdk.CfnOutput(this, `PrivateSubnet${index + 1}_Id`, {
                value: subnet.subnetId,
                description: `Private Isolated Subnet ${index + 1} ID`,
                exportName: `PrivateSubnet${index + 1}-Id`,
            });
        });

        vpc.privateSubnets.forEach((subnet, index) => {
            new cdk.CfnOutput(this, `PrivateSubnetWithEgress${index + 1}-Id`, {
                value: subnet.subnetId,
                description: `Private Egrees Isolated Subnet ${index + 1} ID`,
                exportName: `PrivateSubnetWithEgress${index + 1}-Id`,
            });
        });

        vpc.publicSubnets.forEach((subnet, index) => {
            new cdk.CfnOutput(this, `PublicSubnet${index + 1}_Id`, {
                value: subnet.subnetId,
                description: `Public Isolated Subnet ${index + 1} ID`,
                exportName: `PublicSubnet${index + 1}-Id`,
            });
        });
    }
}