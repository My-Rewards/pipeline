import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import {ShopProp} from "../Interfaces";
import {STATUS_CODE} from "../../global/statusCodes";

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

const shopTable = process.env.SHOP_TABLE;
const orgTable = process.env.ORG_TABLE;

export const handler = async (event: APIGatewayProxyEvent) => {

    const { id } = event.queryStringParameters || {};
    const userSub = event.requestContext.authorizer?.claims?.sub;

    switch (true) {
        case (!shopTable || !orgTable):
            return { statusCode: 500, body: JSON.stringify({ error: "Missing env values" }) };
        case !userSub:
            return { statusCode: 404, body: JSON.stringify({ error: "Missing userSub" }) };
        case !id:
            return { statusCode: 404, body: JSON.stringify({ error: "Missing [shop_id] parameter" }) };
    }

    try {
        const shopParams = new GetCommand({
            TableName: shopTable,
            Key: { id }
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

        const finalShop:ShopProp = {
            org_id: org.id,
            shop_name: shop.name,
            org_name: org.name,
            banner: org.images.banner.url,
            preview: org.images.preview.url,
            logo: org.images.logo.url,
            description: org.description,
            id: shop.id,
            latitude: shop.latitude,
            longitude: shop.longitude,
            menu: shop.menu,
            phone_number: shop.phone,
            location: shop.location,
            shop_hours: shop.shop_hours,
        };

        return {
            statusCode: STATUS_CODE.Success,
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