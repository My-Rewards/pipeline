import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { DOMAIN } from '../../global/constants';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ses from 'aws-cdk-lib/aws-ses';
import { CustomEmailProps } from '../../global/props';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as customResources from 'aws-cdk-lib/custom-resources';

export class CustomEmailStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CustomEmailProps) {
    super(scope, id, props);

    const domain = `${props.authDomain}.${DOMAIN}`;
    const authEmail = `no-reply@${props.authDomain}.${DOMAIN}`;
    const hostedZoneIdAuth = cdk.Fn.importValue(`${props.stageName}-Auth-HostedZoneId`);

    // Get the hosted zone
    const hostedZoneAuth = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZoneAuth', {
      hostedZoneId: hostedZoneIdAuth,
      zoneName: `${props.authDomain}.${DOMAIN}`,
    });

    const domainIdentity = new ses.EmailIdentity(this, 'EmailIdentityDomain', {
        identity: ses.Identity.publicHostedZone(hostedZoneAuth),
        mailFromDomain: `automated.${props.authDomain}.${DOMAIN}`
    });

    // MX Record
    new route53.MxRecord(this, 'MXRecord', {
      zone: hostedZoneAuth,
      values: [{
        hostName: `feedback-smtp.${props.env?.region || 'us-east-1'}.amazonses.com`,
        priority: 10
      }],
      deleteExisting: true
    });

    // SPF Record
    new route53.TxtRecord(this, 'SPFRecord', {
      zone: hostedZoneAuth,
      recordName: `_amazonses.${props.authDomain}.${DOMAIN}`,
      values: ['v=spf1 include:amazonses.com ~all'],
      deleteExisting: true
    });

    // DMARC Record
    new route53.TxtRecord(this, 'DMARCRecord', {
      zone: hostedZoneAuth,
      recordName: '_dmarc',
      values: ['v=DMARC1; p=quarantine; pct=100; fo=1;'],
      deleteExisting: true
    });

    const sesRole = new iam.Role(this, 'CognitoSESRole', {
      assumedBy: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
    });

    // Add more specific permission for the domain
    sesRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: [
        `arn:aws:ses:${props.env?.region}:${props.env?.account}:identity/${props.authDomain}.${DOMAIN}`,
        `arn:aws:ses:${props.env?.region}:${props.env?.account}:identity/${authEmail}`
      ],
    }));

    // Lambda Function to Poll SES Verification
    const verificationCheckerFn = new lambda.Function(this, 'VerificationCheckerFn', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline(`
            const AWS = require('aws-sdk');
            const ses = new AWS.SES();
    
            exports.handler = async (event) => {
                const domain = event.ResourceProperties.Domain;
                console.log(\`Checking verification status for domain: \${domain}\`);
    
                try {
                    const response = await ses.getIdentityVerificationAttributes({
                        Identities: [domain],
                    }).promise();
    
                    const status = response.VerificationAttributes[domain]?.VerificationStatus;
                    console.log(\`Verification status: \${status}\`);
    
                    if (status === 'Success') {
                        return { Status: 'SUCCESS' };
                    } else {
                        throw new Error('Domain verification in progress. Please wait...');
                    }
                } catch (error) {
                    console.error('Error checking domain verification:', error);
                    throw error;
                }
            };
        `),
        timeout: cdk.Duration.minutes(15),
        });

        verificationCheckerFn.addPermission('AllowCustomResourceInvoke', {
        principal: new iam.ServicePrincipal('lambda.amazonaws.com'),
        action: 'lambda:InvokeFunction',
        sourceArn: `arn:aws:cloudformation:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:stack/*`,
        });

        const customResourceRole = new iam.Role(this, 'CustomResourceRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        });
        
        // Grant permissions to invoke the Lambda function
        customResourceRole.addToPolicy(new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [verificationCheckerFn.functionArn],
        }));
    
        // Custom Resource to Wait for Verification
        new customResources.AwsCustomResource(this, 'WaitForDomainVerification', {
        onCreate: {
            service: 'Lambda',
            action: 'invoke',
            parameters: {
            FunctionName: verificationCheckerFn.functionName,
            Payload: JSON.stringify({
                Domain: domain,
            }),
            },
            physicalResourceId: customResources.PhysicalResourceId.of(domain),
        },
        policy: customResources.AwsCustomResourcePolicy.fromSdkCalls({
            resources: customResources.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
        role: customResourceRole
        });
    }
}