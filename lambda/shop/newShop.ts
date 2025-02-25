import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, PutCommandInput, GetCommand, GetCommandInput } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

const requiredEnvVars = ["SHOP_TABLE", "USER_TABLE", "ORG_TABLE"];

exports.handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Request body is required" })
        };
    }

    requiredEnvVars.forEach((envVar) => {
        if (!process.env[envVar]) {
            throw new Error(`Missing required environment variable: ${envVar}`);
        }
    });

    try {
        const { organization_id, square_id, latitude, longitude, shop_hours } = JSON.parse(event.body);

        if (!organization_id || !square_id || !latitude || !longitude  || !shop_hours) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing required fields" })
            };
        }

        const checkOrgParams: GetCommandInput = {
            TableName: process.env.ORG_TABLE!,
            Key: { organization_id }
        };

        const orgResult = await dynamoDb.send(new GetCommand(checkOrgParams));

        if (!orgResult.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: "Organization not found" })
            };
        }

        const shopId = randomUUID();

        const shopAttributes: PutCommandInput = {
            TableName: process.env.SHOPS_TABLE!,
            Item: {
                id: shopId,
                organization_id,
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
