import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as kms from 'aws-cdk-lib/aws-kms';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import {DATABASE_NAME} from "../../../../global/constants";

interface SquareApiStackProps extends cdk.NestedStackProps {
  api: apigateway.RestApi;
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer
  encryptionKey: kms.IKey;
  stage: string;
}

export class SquareApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: SquareApiStackProps) {
    super(scope, id, props);

    const userTable = dynamodb.Table.fromTableArn(this, 'ImportedBizzUsersTable', cdk.Fn.importValue('BizzUserTableARN'));
    const orgTable = dynamodb.Table.fromTableArn(this, 'ImportedOrganizationTableARN', cdk.Fn.importValue('OrganizationTableARN'));
    const clusterSecret = cdk.aws_secretsmanager.Secret.fromSecretCompleteArn(this, 'auroraSecret', cdk.Fn.importValue('AuroraSecretARN'));
    const clusterArn = cdk.Fn.importValue('ClusterARN');

    const secretData = cdk.aws_secretsmanager.Secret.fromSecretNameV2(this, 'fetchSquareSecret', 'square/credentials');

    const vpc = ec2.Vpc.fromVpcAttributes(this, 'ImportedVPC', {
      vpcId: cdk.Fn.importValue('ClusterVPC-Id'),
      availabilityZones: cdk.Fn.getAzs(),
      vpcCidrBlock: '10.0.0.0/24',
      privateSubnetIds: [
        cdk.Fn.importValue('PrivateSubnetWithEgress1-Id'),
        cdk.Fn.importValue('PrivateSubnetWithEgress2-Id')
      ],
      privateSubnetNames: ['Private1', 'Private2'],
      publicSubnetIds: [
        cdk.Fn.importValue('PublicSubnet1-Id'),
        cdk.Fn.importValue('PublicSubnet2-Id')
      ],
      publicSubnetNames: ['Public1', 'Public2'],
      isolatedSubnetIds: [
        cdk.Fn.importValue('PrivateSubnet1-Id'),
        cdk.Fn.importValue('PrivateSubnet2-Id')
      ],
      isolatedSubnetNames: ['Isolated1', 'Isolated2']
    });

    const securityGroupResolvers = ec2.SecurityGroup.fromSecurityGroupId(
        this,
        'ImportedSecurityGroupResolvers',
        cdk.Fn.importValue('SecurityGroupResolversId'),
        { allowAllOutbound: true }
    );

    const clusterRole = iam.Role.fromRoleArn(this, 'ImportedRole', cdk.Fn.importValue('ClusterRoleARN'));

    const setupSquareLambda = new nodejs.NodejsFunction(this, "linkSquare",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/square/link.ts',
      handler: 'handler',
      environment: {
        USER_TABLE: userTable.tableName,
        ORG_TABLE: orgTable.tableName,
        SQUARE_ARN: secretData.secretArn,
        KMS_KEY_ID: props.encryptionKey.keyId,
        APP_ENV: props.stage
      },
      bundling: {
        externalModules: ['aws-sdk'],
        nodeModules: ['square']
      },
      timeout: cdk.Duration.seconds(10),
    })
    userTable.grantReadData(setupSquareLambda);
    orgTable.grantReadWriteData(setupSquareLambda);
    secretData.grantRead(setupSquareLambda)
    props.encryptionKey.grantEncryptDecrypt(setupSquareLambda);

    const removeSquareLambda = new nodejs.NodejsFunction(this, "unlinkSquare",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/organization/square/unlink.ts',
      handler: 'handler',
      vpc,
      role:clusterRole,
      securityGroups:[securityGroupResolvers],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      environment: {
        USER_TABLE: userTable.tableName,
        ORG_TABLE: orgTable.tableName,
        CLUSTER_ARN: clusterArn,
        CLUSTER_SECRET_ARN: clusterSecret.secretArn,
        DB_NAME: DATABASE_NAME
      },
      bundling: {
        externalModules: ['aws-sdk'],
      },
      timeout: cdk.Duration.seconds(10),
    })
    userTable.grantReadData(removeSquareLambda);
    orgTable.grantReadWriteData(removeSquareLambda);

    const listSquareShops = new nodejs.NodejsFunction(this, "list-shops",{
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'lambda/square/listShops.ts',
      handler: 'handler',
      environment: {
        USER_TABLE: userTable.tableName,
        SQUARE_ARN:secretData.secretArn,
        KMS_KEY_ID: props.encryptionKey.keyId,
        APP_ENV:props.stage
      },
      bundling: {
        externalModules: ['aws-sdk'],
        nodeModules: ['square'],
      },
      timeout: cdk.Duration.seconds(10),
    })
    userTable.grantReadData(listSquareShops);
    userTable.grantWriteData(listSquareShops);
    secretData.grantRead(listSquareShops)
    props.encryptionKey.grantDecrypt(listSquareShops);

    const squareApi = props.api.root.addResource('square'); 
    const connectApi = squareApi.addResource('connect'); 
    const disconnectApi = squareApi.addResource('disconnect'); 
    const listShops = squareApi.addResource('listShops'); 

    const setupLambdaIntegration = new apigateway.LambdaIntegration(setupSquareLambda);
    const disconnectLambdaIntegration = new apigateway.LambdaIntegration(removeSquareLambda);
    const shopsLambdaIntegration = new apigateway.LambdaIntegration(listSquareShops);

    connectApi.addMethod('PUT', setupLambdaIntegration, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    disconnectApi.addMethod('PUT', disconnectLambdaIntegration, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    listShops.addMethod('GET', shopsLambdaIntegration, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}
