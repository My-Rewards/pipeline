# Getting Started

****AVOID**** creating resources directly in AWS account manually

****DO NOT**** create resources in pipeline account

##### Example of Resources
- IAM Role/User
- Databases
- Amplify
- Lambda Functions
- APIs

- ...

Before you begin, ensure you have the following installed:

- [AWS CLI](https://aws.amazon.com/cli/) (Ensure you are authenticated and have appropriate permissions)
- [AWS CDK](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html) 

``
  npm install -g aws-cdk@v2
``

## AWS Credentials

In order to use cdk you need to have an AWS credential, many ways to do this...

**Through AWS Portal (Reccomended)**

go to your AWS Portal and select **Access Keys** for pipeline account

Copy option 1 into terminal

ex:
```
export AWS_ACCESS_KEY_ID= xxxxx
export AWS_SECRET_ACCESS_KEY= xxxxx
export AWS_SESSION_TOKEN= xxxxx
```

## AWS CDK Commands

Brief rundown of commonly used AWS CDK commands:

## Deploying Stacks
A Stack is responisble for handling a resource in AWS

> ex: PipelineStack/beta/Amplify-Stack
> 
> Would be responsible for creating the amplify app with userpool and authentication

####

``cdk deploy PipelineStack/beta/<stack-name>``

**DO NOT** deploy prod Stacks

You risk corrupting the prod environment doing so.

The goal is to deploy to beta, mess around with beta, then when cdk stacks are deploying properly in beta, push changes to repo.

AWS automatically handles deploying to prod upon approval.

### Deploying entire stage

```
npm run-script deploy
```

# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template