import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class CdkPipelineStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const repository = new ecr.Repository(this, 'CdkPipelineRepo', {
        repositoryName: 'cdk-pipeline-repo',
        removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep the repository even if the stack is deleted
      });
  
      // Create a VPC for the ECS cluster
      const vpc = new ec2.Vpc(this, 'CdkPipelineVpc', {
        maxAzs: 2 // Deploy across 2 Availability Zones
      });
  
      // Create an ECS Cluster
      const cluster = new ecs.Cluster(this, 'CdkPipelineCluster', {
        vpc: vpc
      });
  
      // Define an IAM Role for the ECS Task Execution
      const executionRole = new iam.Role(this, 'CdkPipelineExecutionRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
        ]
      });
  
      // Define the ECS Task Definition for Fargate
      const taskDefinition = new ecs.FargateTaskDefinition(this, 'CdkPipelineTaskDefinition', {
        memoryLimitMiB: 1024, // 1 GB RAM
        cpu: 512, // 0.5 vCPU
        executionRole: executionRole
      });
  
      // Add a container to the task definition
      const container = taskDefinition.addContainer('CdkPipelineContainer', {
        image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
        logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'cdk-pipeline' }),
      });
  
      // Define a Fargate Service to run the task
      new ecs.FargateService(this, 'CdkPipelineService', {
        cluster,
        taskDefinition,
        desiredCount: 0, // No containers running by default, only triggered on demand
      });
  
      // Output the ECR repository URI for reference
      new cdk.CfnOutput(this, 'EcrRepoUri', {
        value: repository.repositoryUri,
        description: 'ECR repository URI for storing the CDK pipeline container'
      });
    }
  }
  
