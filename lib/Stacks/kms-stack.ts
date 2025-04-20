import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { GenericStackProps } from "../../global/props";
import * as kms from "aws-cdk-lib/aws-kms";

export class KmsStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: GenericStackProps) {
        super(scope, id, props);

        const encryptionKey = new kms.Key(this, "KMSEncryptionKey", {
            enableKeyRotation: true,
            description: "KMS Key for encrypting token data for database",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        new cdk.CfnOutput(this, 'kmsARN', {
            value: encryptionKey.keyArn,
            description: 'kmsARN',
            exportName: 'kmsARN',
        });
    }
}
