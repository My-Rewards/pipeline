import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { ShopProps } from "../../Interfaces";
import {ExecuteStatementCommand, RDSDataClient } from "@aws-sdk/client-rds-data";

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);
const rdsClient = new RDSDataClient({});

const shopTable = process.env.SHOP_TABLE;
const orgTable = process.env.ORG_TABLE;
const secretArn = process.env.SECRET_ARN;
const resourceArn = process.env.CLUSTER_ARN;
const database = process.env.DB_NAME;

export const handler = async (event: APIGatewayProxyEvent) => {


    const { shop_id } = event.queryStringParameters || {};
    const userSub = event.requestContext.authorizer?.claims?.sub;

    switch (true) {
        case (!shopTable || !orgTable || !secretArn || !resourceArn || !database):
            return { statusCode: 500, body: JSON.stringify({ error: "Missing env values" }) };
        case !userSub:
            return { statusCode: 404, body: JSON.stringify({ error: "Missing userSub" }) };
        case !shop_id:
            return { statusCode: 404, body: JSON.stringify({ error: "Missing [shop_id] parameter" }) };
    }

    try {
        const shopParams = new GetCommand({
            TableName: shopTable,
            Key: { id:shop_id }
        });

        const shopResult = await dynamoDb.send(shopParams);
        const shop = shopResult.Item;

        if (!shop || !shop.id || !shop.org_id || !shop.latitude || !shop.longitude) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: "Shop not found" }),
            };
        }

        const orgParams = new GetCommand({
            TableName: orgTable,
            Key: { id:shop.org_id },
            ProjectionExpression: "id, #org_name, description, images",
            ExpressionAttributeNames: { "#org_name": "name" }
        });

        const orgResult = await dynamoDb.send(orgParams);
        const org = orgResult.Item;

        if (!org || !org.id) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: "Organization not found" }),
            };
        }

        const records = await auroraCall(shop.org_id, userSub);
        const favorite = records[0]?.[0]?.booleanValue === true;

        const finalShop:ShopProps = {
            org_id: org.id,
            name: org.name,
            banner: org.images.banner.url,
            preview: org.images.preview.url,
            logo: org.images.logo.url,
            description: org.description,
            id: shop.id,
            latitude: shop.latitude,
            longitude: shop.longitude,
            menu: shop.menu,
            phone: shop.phone,
            location: shop.location,
            shop_hours: shop.shop_hours,
            favorite
        };

        return {
            statusCode: 200,
            body: JSON.stringify(finalShop),
            headers: {
                "Content-Type": "application/json",
            },
        };

    } catch (error) {
        console.error(error)
        return {
            statusCode: 500,
            body: JSON.stringify({ error }),
        };
    }
};

async function auroraCall(org_id: string, userSub: string) {
    const auroraResult = await rdsClient.send(
        new ExecuteStatementCommand({
            secretArn: secretArn,
            resourceArn: resourceArn,
            database: database,
            sql: `
                SELECT EXISTS (
                    SELECT 1
                    FROM OrgLikes
                    WHERE user_id = :userSub
                      AND organization_id = :orgId
                ) AS is_liked;
            `,
            parameters: [
                { name: "userSub", value: { stringValue: userSub } },
                { name: "orgId", value: { stringValue: org_id } },
            ],
        })
    );

    return auroraResult.records || []
}