import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

const shopsTable = process.env.SHOPS_TABLE;

exports.handler = (event: APIGatewayProxyEvent): APIGatewayProxyResult => {
    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Request body is required" })
        };
    }

    try {
        const { organization_id, square_id, latitude, longitude, shop_hours } = JSON.parse(event.body);

        if (!organization_id || !square_id || !latitude || !longitude  || !shop_hours) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing required fields" })
            };
        }

        const shopId = randomUUID();

        const shopAttributes = {
            id: shopId,
            organization_id,
            square_id,
            latitude,
            longitude,
            shop_hours,
            active: false,
        };

        dynamoDb.send(new PutCommand({
            TableName: shopsTable,
            Item: shopAttributes
        }));

        return {
            statusCode: 201,
            body: JSON.stringify({ success: true })
        };
    } catch (error) {
        console.error("Error creating shop:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};
