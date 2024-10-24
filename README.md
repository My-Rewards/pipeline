# Getting Started

> ****AVOID**** creating resources directly in AWS account manually
>
> ****DO NOT**** create resources in pipeline account
> 
> ****AVOID**** canceling during stack deployment, can corrupt the stack in AWS
####

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

```
  npm install -g aws-cdk@v2
```

## AWS Credentials

In order to use cdk you need to have an AWS credential, many ways to do this...

**Through AWS Portal (Quickest)**

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

``cdk list`` lists all stacks in the pipeline

## Deploying Stacks
A Stack is responisble for handling a resource in AWS

> ex: PipelineStack/beta/Amplify-Stack
> 
> Would be responsible for creating the amplify app

####

``cdk deploy PipelineStack/beta/<stack-name>``

**DO NOT** deploy prod Stacks

> You risk corrupting the prod environment doing so.
##

**AVOID** running ``cdk deploy``

> This will deploy the entire pipeline to the pipeline account, this isn't nessecarly the worst thing ever. Worst case scenario it fails in which case you need to fix.
> But it does cost money so keep in mind and try to avoid deploying pipeline, deploy all beta stacks instead
>

> cdk code allows for all resources to be regenerated, so don't feel scared to delete stack and remove cdk generate resources IF NEEDED.
>
> Ex of needing to delete a resource: It can't be modified, issues with further dependent stacks that need removal
####

The goal is to deploy to beta, mess around with beta, then when cdk stacks are deploying properly in beta, push changes to repo.

AWS automatically handles deploying to prod upon approval, so no need to worry about deploying to prod

### Deploying entire stage

If you want to deploy all stacks in beta run the below command

```
npm run-script deploy
```

### Deeper understanding of CDK

#### How does the code know that it shouldn't regenerate an existing resource? **It doesn't**

AWS handles that, all cdk is doing is creating a template (like a blueprint) for AWS on what it needs and its exact configuration. AWS checks to see if that resource exists and if not it'll
generate it.

#### Why can you sauce up beta but not prod? **Make mistakes in beta NOT prod**

When your developing resources youll probably come across a point where you need to delete a resource because you cant update it or for any other reason. Thats what beta is for, the final perfected version goes
to prod. Hence, **if your code isn't deploying in beta it will 100% not deploy in prod**, so make sure beta is working.

#### Difference between Beta and Prod? **Nothing, besides IDs**

Each time a resource is created it's assigned an ID, these ID's are different each time a resource is generated from scratch (removed then redeployed too). Hence, both beta and prod would have 2 completly different
env variables for frontend since things such as amplify, userpool, apis, aren't the same.

### Additionally

use ``cdk.CfnOutput`` to output info generated from a stack to be accessed by other stacks

use ``cdk.Fn.importValue`` to import resources outputed from other stacks

Keep in mind order of dependency. You shouldnt be calling ``cdk.Fn.importValue`` before it's been ``cdk.CfnOutput`` by it's stack 

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