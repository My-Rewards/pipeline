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
import {getAuroraAccess} from "../../util/aurora-access";

interface UsersApiStackProps extends cdk.NestedStackProps {
    appRoot:  cdk.aws_apigateway.Resource
    authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
}

export class ShopApiStack extends cdk.NestedStack {
    constructor(scope: Construct, id: string, props: UsersApiStackProps) {
        super(scope, id, props);

        // Get infrastructure resources using the helper function
        const { vpc, clusterSecret, clusterArn, clusterRole, securityGroupResolvers } = getAuroraAccess(this, id);

        const shopTable = dynamodb.Table.fromTableArn(this, "ImportedShopTableARN",
            cdk.Fn.importValue("ShopTableARN")
        );
        const orgTable = dynamodb.Table.fromTableArn(this, "ImportedOrganizationTableARN",
            cdk.Fn.importValue("OrganizationTableARN")
        );
        const userTable = dynamodb.Table.fromTableArn(this, "ImportedUserTable",
            cdk.Fn.importValue("UserTableARN")
        );

        // Get Shop API
        const getShopLambda = new nodejs.NodejsFunction(this, "getShop-handler", {
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: "lambda/shop/getShopApp.ts",
            handler: "handler",
            functionName:'Fetch-Shop',
            vpc,
            role: clusterRole,
            securityGroups: [securityGroupResolvers],
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            environment: {
                SHOP_TABLE: shopTable.tableName,
                ORG_TABLE: orgTable.tableName,
                DB_NAME: DATABASE_NAME,
                CLUSTER_ARN: clusterArn,
                SECRET_ARN: clusterSecret.secretArn,
            },
            bundling: {
                externalModules: ["aws-sdk"],
            },
        });

        shopTable.grantReadData(getShopLambda);
        orgTable.grantReadData(getShopLambda);

        // Radius Shops API
        const radiusShopsLambda = new nodejs.NodejsFunction(
            this,
            "radiusShopsLambda",
            {
                runtime: lambda.Runtime.NODEJS_20_X,
                entry: "lambda/shop/getRadiusShops.ts",
                handler: "handler",
                functionName:'Fetch-Radius-Shops',
                vpc,
                role: clusterRole,
                securityGroups: [securityGroupResolvers],
                vpcSubnets: {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                environment: {
                    SHOP_TABLE: shopTable.tableName,
                    ORG_TABLE: orgTable.tableName,
                    DB_NAME: DATABASE_NAME,
                    CLUSTER_ARN: clusterArn,
                    SECRET_ARN: clusterSecret.secretArn,
                },
                bundling: {
                    externalModules: ["aws-sdk"],
                },
                description: 'Fetch radius shops Lambda (v1.0.0)'
            }
        );

        shopTable.grantReadData(radiusShopsLambda);
        orgTable.grantReadData(radiusShopsLambda);

        // Discover Shops API
        const discoverShopsLambda = new nodejs.NodejsFunction(this, "discoverShopsLambda", {
                runtime: lambda.Runtime.NODEJS_20_X,
                entry: "lambda/shop/getDiscoverShops.ts",
                handler: "handler",
                functionName:'Fetch-Discover-Page',
                vpc,
                role: clusterRole,
                securityGroups: [securityGroupResolvers],
                vpcSubnets: {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                environment: {
                    SHOP_TABLE: shopTable.tableName,
                    ORG_TABLE: orgTable.tableName,
                    DB_NAME: DATABASE_NAME,
                    CLUSTER_ARN: cdk.Fn.importValue("ClusterARN"),
                    SECRET_ARN: cdk.Fn.importValue("AuroraSecretARN"),
                },
                bundling: {
                    externalModules: ["aws-sdk"],
                },
            }
        );

        shopTable.grantReadData(discoverShopsLambda);
        orgTable.grantReadData(discoverShopsLambda);

        const searchShops = new nodejs.NodejsFunction( this, "searchOrganinations",
            {
                runtime: lambda.Runtime.NODEJS_20_X,
                entry: "lambda/organization/search.ts",
                handler: "handler",
                functionName:'Search-Organizations',
                vpc,
                role: clusterRole,
                securityGroups: [securityGroupResolvers],
                vpcSubnets: {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                environment: {
                    ORG_TABLE: orgTable.tableName,
                    DB_NAME: DATABASE_NAME,
                    CLUSTER_ARN: clusterArn,
                    SECRET_ARN: clusterSecret.secretArn
                },
                bundling: {
                    externalModules: ["aws-sdk"],
                },
            }
        );
        orgTable.grantReadData(searchShops);

        const nearestShopLambda = new nodejs.NodejsFunction( this, "nearestOrganization",
            {
                runtime: lambda.Runtime.NODEJS_20_X,
                entry: "lambda/shop/nearestShop.ts",
                handler: "handler",
                functionName:'Fetch-Nearest-Shops',
                vpc,
                role: clusterRole,
                securityGroups: [securityGroupResolvers],
                vpcSubnets: {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                environment: {
                    ORG_TABLE: orgTable.tableName,
                    SHOP_TABLE: shopTable.tableName,
                    DB_NAME: DATABASE_NAME,
                    CLUSTER_ARN: clusterArn,
                    SECRET_ARN: clusterSecret.secretArn
                },
                bundling: {
                    externalModules: ["aws-sdk"],
                },
            }
        );
        orgTable.grantReadData(searchShops);
        shopTable.grantReadData(nearestShopLambda);

        const pinShopLambda = new nodejs.NodejsFunction( this, "pinnedShop",
            {
                runtime: lambda.Runtime.NODEJS_20_X,
                entry: "lambda/shop/getPinShop.ts",
                handler: "handler",
                functionName:'Fetch-Pinned-Shop',
                vpc,
                role: clusterRole,
                securityGroups: [securityGroupResolvers],
                vpcSubnets: {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                environment: {
                    ORG_TABLE: orgTable.tableName,
                    SHOP_TABLE: shopTable.tableName,
                    DB_NAME: DATABASE_NAME,
                    CLUSTER_ARN: clusterArn,
                    SECRET_ARN: clusterSecret.secretArn
                },
                bundling: {
                    externalModules: ["aws-sdk"],
                },
                description: 'Fetch pinned shops Lambda (v1.0.0)'
            }
        );
        orgTable.grantReadData(pinShopLambda);
        shopTable.grantReadData(pinShopLambda);
        // API Gateway integration

        const shopApi = props.appRoot.addResource("shops");
        const filterByShops = shopApi.addResource("filter");

        const getShopApi = shopApi.addResource("shop");
        const discoverShopApi = shopApi.addResource("discover");
        const pinShopApi = shopApi.addResource("pinned");
        const searchShopApi = shopApi.addResource("search");
        const filterByRadius = filterByShops.addResource("radius");
        const nearestShopApi = shopApi.addResource("nearest");

        const getShop = new apigateway.LambdaIntegration(getShopLambda);
        const pinShop = new apigateway.LambdaIntegration(pinShopLambda);
        const discoverIntegration = new apigateway.LambdaIntegration(discoverShopsLambda);
        const searchIntegration = new apigateway.LambdaIntegration(searchShops);
        const radiusIntegration = new apigateway.LambdaIntegration(radiusShopsLambda);
        const nearestShopIntegration = new apigateway.LambdaIntegration(nearestShopLambda);

        discoverShopApi.addMethod("GET", discoverIntegration, {
            authorizer: props.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        getShopApi.addMethod("GET", getShop, {
            authorizer: props.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        pinShopApi.addMethod("GET", pinShop, {
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
        nearestShopApi.addMethod("GET", nearestShopIntegration, {
            authorizer: props.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
    }
}
