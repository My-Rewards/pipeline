import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as kms from "aws-cdk-lib/aws-kms";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { DATABASE_NAME } from "../../../../global/constants";
interface UsersApiStackProps extends cdk.NestedStackProps {
    appRoot:  cdk.aws_apigateway.Resource
    authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
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

        const clusterSecret = cdk.aws_secretsmanager.Secret.fromSecretCompleteArn(
            this,
            "auroraSecret",
            cdk.Fn.importValue("AuroraSecretARN")
        );

        const clusterRole = iam.Role.fromRoleArn(
            this,
            "ImportedRole",
            cdk.Fn.importValue("ClusterRoleARN"),
        );

        const securityGroupResolvers = ec2.SecurityGroup.fromSecurityGroupId(
            this,
            "ImportedSecurityGroupResolvers",
            cdk.Fn.importValue("SecurityGroupResolversId"),
            { allowAllOutbound: true }
        );

        //Get imported values
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
            "ImportedUserTable",
            cdk.Fn.importValue("UserTableARN")
        );
        const likesTable = dynamodb.Table.fromTableArn(
            this,
            "ImportedLikesTableARN",
            cdk.Fn.importValue("LikesTableARN")
        );

        // Get Shop API
        const getShopLambda = new nodejs.NodejsFunction(this, "getShop-handler", {
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: "lambda/shop/getShopApp.ts",
            handler: "handler",
            environment: {
                SHOP_TABLE: shopTable.tableName,
                ORG_TABLE: orgTable.tableName,
                LIKES_TABLE: likesTable.tableName,
            },
            bundling: {
                externalModules: ["aws-sdk"],
            },
        });

        shopTable.grantReadData(getShopLambda);
        orgTable.grantReadData(getShopLambda);
        likesTable.grantReadData(getShopLambda);

        // Radius Shops API
        const radiusShopsLambda = new nodejs.NodejsFunction(
            this,
            "radiusShopsLambda",
            {
                runtime: lambda.Runtime.NODEJS_20_X,
                entry: "lambda/shop/getRadiusShops.ts",
                handler: "handler",
                vpc,
                role: clusterRole,
                securityGroups: [securityGroupResolvers],
                vpcSubnets: {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                environment: {
                    SHOP_TABLE: shopTable.tableName,
                    ORG_TABLE: orgTable.tableName,
                    LIKES_TABLE: likesTable.tableName,
                    DB_NAME: DATABASE_NAME,
                    CLUSTER_ARN: cdk.Fn.importValue("ClusterARN"),
                    SECRET_ARN: cdk.Fn.importValue("AuroraSecretARN"),
                    GET_SHOP_LAMBDA_NAME: getShopLambda.functionName,
                },
                bundling: {
                    externalModules: ["aws-sdk"],
                },
            }
        );

        shopTable.grantReadData(radiusShopsLambda);
        orgTable.grantReadData(radiusShopsLambda);
        likesTable.grantReadData(radiusShopsLambda);

        // Discover Shops API
        const discoverShopsLambda = new nodejs.NodejsFunction(
            this,
            "discoverShopsLambda",
            {
                runtime: lambda.Runtime.NODEJS_20_X,
                entry: "lambda/shop/getDiscoverShops.ts",
                handler: "handler",
                vpc,
                role: clusterRole,
                securityGroups: [securityGroupResolvers],
                vpcSubnets: {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                environment: {
                    SHOP_TABLE: shopTable.tableName,
                    ORG_TABLE: orgTable.tableName,
                    LIKES_TABLE: likesTable.tableName,
                    DB_NAME: DATABASE_NAME,
                    CLUSTER_ARN: cdk.Fn.importValue("ClusterARN"),
                    SECRET_ARN: cdk.Fn.importValue("AuroraSecretARN"),
                    GET_SHOP_LAMBDA_NAME: getShopLambda.functionName,
                },
                bundling: {
                    externalModules: ["aws-sdk"],
                },
            }
        );

        shopTable.grantReadData(discoverShopsLambda);
        orgTable.grantReadData(discoverShopsLambda);
        likesTable.grantReadData(discoverShopsLambda);

        const searchShops = new nodejs.NodejsFunction( this, "searchOrganinations",
            {
                runtime: lambda.Runtime.NODEJS_20_X,
                entry: "lambda/organization/search.ts",
                handler: "handler",
                environment: {
                    ORG_TABLE: orgTable.tableName,
                },
                bundling: {
                    externalModules: ["aws-sdk"],
                },
            }
        );
        orgTable.grantReadData(searchShops);

        // API Gateway integration
        const filterByShops = shopApi.addResource("filter");

        const shopApi = props.appRoot.addResource("shops");
        const getShopApi = shopApi.addResource("shop");
        const discoverShopApi = shopApi.addResource("discover");
        const searchShopApi = shopApi.addResource("search");
        const filterByRadius = filterByShops.addResource("radius");

        const getShop = new apigateway.LambdaIntegration(getShopLambda);
        const discoverIntegration = new apigateway.LambdaIntegration(discoverShopsLambda);
        const searchIntegration = new apigateway.LambdaIntegration(searchShops);
        const radiusIntegration = new apigateway.LambdaIntegration(radiusShopsLambda);

        discoverShopApi.addMethod("GET", discoverIntegration, {
            authorizer: props.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        getShopApi.addMethod("GET", getShop, {
            authorizer: props.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        searchShopApi.addMethod("GET", searchIntegration, {
            authorizer: props.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });

        filterByRadius.addMethod("GET", radiusIntegration, {
          authorizer: props.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        });
    }
}
