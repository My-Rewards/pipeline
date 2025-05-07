import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as kms from "aws-cdk-lib/aws-kms";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {DATABASE_NAME} from "../../../../global/constants";
import {getAuroraAccess} from "../../util/aurora-access";

interface UsersApiStackProps extends cdk.NestedStackProps {
  api: apigateway.RestApi;
  authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
  encryptionKey: kms.IKey;
}

export class ShopApiStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: UsersApiStackProps) {
    super(scope, id, props);

    const { vpc, clusterSecret, clusterArn, clusterRole, securityGroupResolvers } = getAuroraAccess(this, id);

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
        SECRET_ARN: clusterSecret.secretArn,
        CLUSTER_ARN: clusterArn,
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

    const fetchShopLambda = new nodejs.NodejsFunction(this, "Fetch-Shop-Bizz", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: "lambda/shop/getShop.ts",
      handler: "handler",
      functionName: "Fetch-Shop-Bizz",
      environment: {
        SHOP_TABLE: shopTable.tableName,
        USER_TABLE: userTable.tableName,
        ORG_TABLE: orgTable.tableName,
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

    shopTable.grantReadWriteData(fetchShopLambda);
    orgTable.grantReadWriteData(fetchShopLambda);
    userTable.grantReadData(fetchShopLambda);

    const shopApi = props.api.root.addResource("shops");
    const createShopApi = shopApi.addResource("create");

    const createShop = new apigateway.LambdaIntegration(createShopLambda);
    const getShop = new apigateway.LambdaIntegration(fetchShopLambda);

    createShopApi.addMethod("POST", createShop, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    shopApi.addMethod("GET", getShop, {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}