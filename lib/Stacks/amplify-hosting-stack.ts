import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as custom from 'aws-cdk-lib/custom-resources';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { AmplifyHostingStackProps } from '../../global/props';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { App, Branch, GitHubSourceCodeProvider, Platform, RedirectStatus } from '@aws-cdk/aws-amplify-alpha';



export class AmplifyHostingStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: AmplifyHostingStackProps) {
        super(scope, id, props);

        const githubToken = cdk.SecretValue.secretsManager(props.githubOauthTokenName);

        // ✅ Use High-Level Amplify App Construct
        const amplifyApp = new App(this, 'BusinessWebsiteAmplifyApp', {
            appName: 'BusinessWebsite',
            sourceCodeProvider: new GitHubSourceCodeProvider({
                owner: props.githubOwner,
                repository: props.githubRepo,
                oauthToken: githubToken

            }),
            platform: Platform.WEB_COMPUTE,
            environmentVariables: {
                AMPLIFY_BRANCH: props.githubBranch,
                //NEXT_PUBLIC_API_URL: props.apiUrl || "https://6zmowcw1sa.execute-api.us-east-1.amazonaws.com/prod",
                // NEXT_PUBLIC_STRIPE_PUBLIC_KEY: props.stripePublicKey || "your-stripe-key"
            },
            customRules: [
                { source: "/<*>", target: "/index.html", status: RedirectStatus.REWRITE },
                // { source: "/_next/static/<*>", target: "/_next/static/<*>", status: RedirectStatus.REWRITE },
                // { source: "/_next/image/<*>", target: "/_next/image/<*>", status: RedirectStatus.REWRITE },
                // { source: "/_next/static/chunks/<*>", target: "/_next/static/chunks/<*>", status: RedirectStatus.REWRITE },
                // { source: "/_next/static/css/<*>", target: "/_next/static/css/<*>", status: RedirectStatus.REWRITE }
            ],

            buildSpec: codebuild.BuildSpec.fromObjectToYaml({
                version: 1,
                frontend: {
                    phases: {
                        preBuild: { commands: ["npm ci"]},
                        build: { commands: ["npm run build"] }
                    },
                    artifacts: {
                        baseDirectory: ".next",
                        files: ["**/*"]
                    },
                    cache: {
                        paths: ["node_modules/**/*"]
                    }
                }
            })
        });

        // ✅ Use High-Level Amplify Branch Construct
        const betaBranch = new Branch(this, 'BetaBranch', {
            app: amplifyApp,
            branchName: props.githubBranch,
            stage: "BETA",
            autoBuild: true
        });

        // ✅ Lambda Function to Trigger a Build
        const buildTriggerFunction = new lambda.Function(this, 'TriggerAmplifyBuild', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromInline(`
                const AWS = require('aws-sdk');
                const amplify = new AWS.Amplify();
                exports.handler = async function(event) {
                    console.log('Triggering Amplify Build...');
                    await amplify.startDeployment({ appId: '${amplifyApp.appId}', branchName: '${props.githubBranch}' }).promise();
                    console.log('Build Triggered!');
                    return { status: 'Build started' };
                };
            `),
            initialPolicy: [
                new iam.PolicyStatement({
                    actions: ['amplify:StartDeployment'],
                    resources: [`arn:aws:amplify:${this.region}:${this.account}:apps/${amplifyApp.appId}/branches/${props.githubBranch}`],
                }),
            ],
        });

        // ✅ Trigger Lambda Function When CDK Deploys
        new custom.AwsCustomResource(this, 'TriggerAmplifyBuildOnDeploy', {
            onCreate: {
                service: 'Lambda',
                action: 'invoke',
                parameters: {
                    FunctionName: buildTriggerFunction.functionName,
                    InvocationType: 'RequestResponse',
                },
                physicalResourceId: custom.PhysicalResourceId.of('AmplifyDeploymentTrigger'),
            },
            policy: custom.AwsCustomResourcePolicy.fromStatements([
                new iam.PolicyStatement({
                    actions: ['lambda:InvokeFunction'],
                    resources: [buildTriggerFunction.functionArn],
                }),
            ]),
        });

        new cdk.CfnOutput(this, 'AmplifyAppId', {
            value: amplifyApp.appId,
            description: 'The ID of the Amplify app'
        });

        new cdk.CfnOutput(this, 'AmplifyBranchUrl', {
            value: `https://${amplifyApp.defaultDomain}`,
            description: 'Amplify Hosted Website URL'
        });
    }
}
