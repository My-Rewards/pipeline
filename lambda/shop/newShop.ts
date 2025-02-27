import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, PutCommandInput, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

exports.handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Request body is required" })
        };
    }

    const shopTable = process.env.SHOP_TABLE;
    const userTable = process.env.USER_TABLE;
    const orgTable = process.env.ORG_TABLE;

    try {
        const { 
            org_id, square_id, latitude, longitude, shop_hours } = JSON.parse(event.body);

        if (!org_id || !square_id || !latitude || !longitude  || !shop_hours) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing required fields" })
            };
        }

        const getOrg = new GetCommand({
            TableName: orgTable,
            Key: { org_id }
        });

        const orgResult = await dynamoDb.send(getOrg);

        if (!orgResult.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: "Organization not found" })
            };
        }

        const shopId = randomUUID();

        const shopAttributes: PutCommandInput = {
            TableName: shopTable,
            Item: {
                id: shopId,
                org_id,
                square_id,
                latitude,
                longitude,
                shop_hours,
                active: false,
            }
        };

        await dynamoDb.send(new PutCommand(shopAttributes));

        return {
            statusCode: 201,
            body: JSON.stringify({ success: true, shopId })
        };
    } catch (error) {
        console.error("Error creating shop:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};
