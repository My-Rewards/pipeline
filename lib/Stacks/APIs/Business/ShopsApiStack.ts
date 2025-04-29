import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as kms from "aws-cdk-lib/aws-kms";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import {DATABASE_NAME} from "../../../../global/constants";

interface UsersApiStackProps extends cdk.NestedStackProps {
  api: apigateway.RestApi;
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
  encryptionKey: kms.IKey;
}

export class ShopApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: UsersApiStackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromVpcAttributes(this, "ImportedVPC", {
      vpcId: cdk.Fn.importValue("ClusterVPC-Id"),
      availabilityZones: cdk.Fn.getAzs(),
      vpcCidrBlock: "10.0.0.0/24",
      privateSubnetIds: [
        cdk.Fn.importValue("PrivateSubnetWithEgress1-Id"),
        cdk.Fn.importValue("PrivateSubnetWithEgress2-Id"),
      ],
      privateSubnetNames: ["Private1", "Private2"],
      publicSubnetIds: [
        cdk.Fn.importValue("PublicSubnet1-Id"),
        cdk.Fn.importValue("PublicSubnet2-Id"),
      ],
      publicSubnetNames: ["Public1", "Public2"],
      isolatedSubnetIds: [
        cdk.Fn.importValue("PrivateSubnet1-Id"),
        cdk.Fn.importValue("PrivateSubnet2-Id"),
      ],
      isolatedSubnetNames: ["Isolated1", "Isolated2"],
    });

    const clusterRole = iam.Role.fromRoleArn(
        this,
        "ImportedRole",
        cdk.Fn.importValue("ClusterRoleARN")
    );

    const securityGroupResolvers = ec2.SecurityGroup.fromSecurityGroupId(
        this,
        "ImportedSecurityGroupResolvers",
        cdk.Fn.importValue("SecurityGroupResolversId"),
        { allowAllOutbound: true }
    );

    const shopTable = dynamodb.Table.fromTableArn(
        this,
        "ImportedShopTableARN",
        cdk.Fn.importValue("ShopTableARN")
    );
    const orgTable = dynamodb.Table.fromTableArn(
        this,
        "ImportedOrganizationTableARN",
        cdk.Fn.importValue("OrganizationTableARN")
    );
    const userTable = dynamodb.Table.fromTableArn(
        this,
        "ImportedBizzUsersTable",
        cdk.Fn.importValue("BizzUserTableARN")
    );

    const createShopLambda = new nodejs.NodejsFunction(this, "Create-Shop", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: "lambda/shop/newShop.ts",
      handler: "handler",
      functionName: "Create-Shop",
      environment: {
        SHOP_TABLE: shopTable.tableName,
        USER_TABLE: userTable.tableName,
        ORG_TABLE: orgTable.tableName,
        SECRET_ARN: cdk.Fn.importValue("AuroraSecretARN"),
        CLUSTER_ARN: cdk.Fn.importValue("ClusterARN"),
        DB_NAME: DATABASE_NAME,
      },
      vpc,
      role: clusterRole,
      securityGroups: [securityGroupResolvers],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      bundling: {
        externalModules: ["aws-sdk"],
      },
    });

    shopTable.grantReadWriteData(createShopLambda);
    orgTable.grantReadWriteData(createShopLambda);
    userTable.grantReadData(createShopLambda);
    props.encryptionKey.grantEncryptDecrypt(createShopLambda);

    const shopApi = props.api.root.addResource("shops");
    const createShopApi = shopApi.addResource("create");
    const createShop = new apigateway.LambdaIntegration(createShopLambda);

    createShopApi.addMethod("POST", createShop, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}