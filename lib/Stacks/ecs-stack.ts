// import * as cdk from 'aws-cdk-lib';
// import { Construct } from 'constructs';
// import * as ecs from 'aws-cdk-lib/aws-ecs';
// import * as ecr from 'aws-cdk-lib/aws-ecr';
// import * as iam from 'aws-cdk-lib/aws-iam';
// import * as ec2 from 'aws-cdk-lib/aws-ec2';

// export class FargateStack extends cdk.Stack {
//   constructor(scope: Construct, id: string, props?: cdk.StackProps) {
//     super(scope, id, props);
//     const repository = new ecr.Repository(this, 'CentralRepo', {
//         repositoryName: 'central-repo',
//         removalPolicy: cdk.RemovalPolicy.RETAIN,
//       });
  
//       const vpc = new ec2.Vpc(this, 'CdkPipelineVpc', {
//         maxAzs: 2
//       });
  
//       const cluster = new ecs.Cluster(this, 'PipelineCluster', {
//         vpc: vpc
//       });
  
//       const executionRole = new iam.Role(this, 'EcsExecutionRole', {
//         assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
//         managedPolicies: [
//           iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
//         ]
//       });
  
//       const taskDefinition = new ecs.FargateTaskDefinition(this, 'PipelineTaskDefinition', {
//         memoryLimitMiB: 1024,
//         cpu: 512,
//         executionRole: executionRole
//       });
  
//       const container = taskDefinition.addContainer('PipelineContainer', {
//         image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
//         logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'cdk-pipeline' }),
//       });
  
//       new ecs.FargateService(this, 'FargatePipelineService', {
//         cluster,
//         taskDefinition,
//         desiredCount: 0,
//       });
  
//       new cdk.CfnOutput(this, 'EcrRepoUri', {
//         value: repository.repositoryUri,
//         description: 'ECR repository URI for storing the CDK pipeline container'
//       });
//     }
//   }
  
