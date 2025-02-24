import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BusinessWebsiteStackProps } from '../../global/props';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { App, Branch, Domain, GitHubSourceCodeProvider, Platform, RedirectStatus } from '@aws-cdk/aws-amplify-alpha';
import { DOMAIN, UP_BUSINESS_ID, UPC_BUSINESS, IDENTITY_POOL_BUSINESS} from '../../global/constants';


export class BusinessWebsiteStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: BusinessWebsiteStackProps) {
        super(scope, id, props);

        const githubToken = cdk.SecretValue.secretsManager('github-token');

        const stripeData = cdk.aws_secretsmanager.Secret.fromSecretNameV2(this, 'fetchStripeCredentials', 'stripe/credentials');
        const stripe_key = stripeData.secretValueFromJson('key')
    
        const squareData = cdk.aws_secretsmanager.Secret.fromSecretNameV2(this, 'fetchSquareCredentials', 'square/credentials');
        const square_clientId = squareData.secretValueFromJson('client_id')

        const amplifyApp = new App(this, 'BusinessWebsiteAmplifyApp', {
            appName: 'Business-Website',
            sourceCodeProvider: new GitHubSourceCodeProvider({
                owner: props.githubOwner,
                repository: props.githubRepo,
                oauthToken: githubToken
            }),
            platform: Platform.WEB_COMPUTE,
            environmentVariables: {
                FRAMEWORK: "Next.js",
                AMPLIFY_NEXT_JS_VERSION: "14",
                NEXT_PUBLIC_USERPOOL_ID: cdk.Fn.importValue(UP_BUSINESS_ID),
                NEXT_PUBLIC_WEB_CLIENT_ID: cdk.Fn.importValue(UPC_BUSINESS),
                NEXT_PUBLIC_IDENTITY_POOL_ID: cdk.Fn.importValue(IDENTITY_POOL_BUSINESS),
                NEXT_PUBLIC_AWS_REGION: props.env?.region || 'us-east-1',
                NEXT_PUBLIC_APP_ENV: props.stageName,
                NEXT_PUBLIC_STRIPE_KEY: stripe_key.unsafeUnwrap(),
                NEXT_PUBLIC_SQUARE_CLIENT: square_clientId.unsafeUnwrap()
            },
            customRules: [
                { source: "/<*>", target: "/index.html", status: RedirectStatus.NOT_FOUND_REWRITE },
            ],
            buildSpec: codebuild.BuildSpec.fromObjectToYaml({
                version: 1,
                frontend: {
                    phases: {
                        preBuild: { commands: ["npm ci --cache .npm --prefer-offline"]},
                        build: { commands: ["npm run build"] }
                    },
                    artifacts: {
                        baseDirectory: ".next",
                        files: ["**/*"]
                    },
                    cache: {
                        paths: ["node_modules/**/*", ".next/cache/**/*"]
                    }
                }
            })
        });

        amplifyApp.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE)

        const workingBranch = new Branch(this, 'Branch', {
            app: amplifyApp,
            branchName: props.githubBranch,
            autoBuild: true
        })

        workingBranch.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);

        new Domain(this, 'Main-Website-Domain', {
            app: amplifyApp,
            domainName: `${props.subDomain}.${DOMAIN}`,
            subDomains: [
                {
                    branch: workingBranch,
                    prefix: ''
                }
            ]
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
