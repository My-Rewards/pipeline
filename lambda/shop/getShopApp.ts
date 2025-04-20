import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { ShopProps } from "../Interfaces";

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

export const handler = async (event: APIGatewayProxyEvent) => {

    const shopTable = process.env.SHOP_TABLE;
    const orgTable = process.env.ORG_TABLE;
    const likesTable = process.env.LIKES_TABLE;

    const { shop_id } = event.queryStringParameters || {};
    const userSub = event.requestContext.authorizer?.claims?.sub;

    switch (true) {
        case (!shopTable || !orgTable || !likesTable):
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

        if (!shop || !shop.id || !shop.orgId || !shop.latitude || !shop.longitude) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: "Shop not found" }),
            };
        }

        console.log(shop)

        const orgParams = new GetCommand({
            TableName: orgTable,
            Key: { id:shop.orgId },
            ProjectionExpression: "id, #org_name, description, images",
            ExpressionAttributeNames: { "#org_name": "name" },
        });

        const orgResult = await dynamoDb.send(orgParams);
        const org = orgResult.Item;

        if (!org || !org.id) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: "Organization not found" }),
            };
        }

        const likeParam = new GetCommand({
            TableName: likesTable,
            Key: {
              userId: userSub,
              shopId: shop.id
            }
        });

        const likeResult = await dynamoDb.send(likeParam);
        let favorite = false;

        if(likeResult.Item) {
            favorite = likeResult.Item.favorite;
        }

        const finalShop:ShopProps = {
            organization_id: org.id,
            name: org.name,
            banner: org.images.banner.url,
            logo: org.images.logo.url,
            description: org.description,
            shop_id: shop.id,
            latitude: shop.latitude,
            longitude: shop.longitude,
            menu: shop.menu,
            phoneNumber: shop.phone,
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