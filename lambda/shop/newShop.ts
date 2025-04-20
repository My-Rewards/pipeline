import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Request body is required" }),
        };
    }

    const shopTable = process.env.SHOP_TABLE;
    const userTable = process.env.USER_TABLE;
    const orgTable = process.env.ORG_TABLE;

    switch (true) {
        case !shopTable:
            return { statusCode: 404, body: JSON.stringify({ error: "Missing Shop Table Info" }) };
        case !userTable:
            return { statusCode: 404, body: JSON.stringify({ error: "Missing User Table Info" }) };
        case !orgTable:
            return { statusCode: 404, body: JSON.stringify({ error: "Missing Organization Table Info" }) };
    }

    try {
        const {
            square_id,
            latitude,
            longitude,
            shop_hours,
            phone,
            name,
            location,
            geohash,
            square_location_id
        } = JSON.parse(event.body);

        const userSub = event.requestContext.authorizer?.claims?.sub;

        if (!userSub) {
            return { statusCode: 400, body: JSON.stringify({ error: "User ID is required" }) };
        }

        if (!square_id || !latitude || !longitude || !shop_hours) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing required fields" }),
            };
        }

        const getUser = new GetCommand({
            TableName: userTable,
            Key: { id: userSub },
            ProjectionExpression: "orgId, #userPermissions",
            ExpressionAttributeNames: { "#userPermissions": "permissions" },
        });
        const resultUser = await dynamoDb.send(getUser);

        if (!resultUser.Item) {
            return { statusCode: 210, body: JSON.stringify({ error: "User email not found in database or User already linked to Organization" }) };
        } else if (!resultUser.Item.orgId) {
            return { statusCode: 210, body: JSON.stringify({ error: "Organization not found" }) };
        }

        const orgId = resultUser.Item.orgId;


        const orgResult = await dynamoDb.send(new GetCommand({
            TableName: orgTable,
            Key: { id: orgId },
        }));
        if (!orgResult.Item) {
            return {
                statusCode: 210,
                body: JSON.stringify({ error: "Organization not found" }),
            };
        }


        const userResult = await dynamoDb.send(new GetCommand({
            TableName: userTable,
            Key: { id: userSub },
            ProjectionExpression: "orgId",
        }));
        if (!userResult.Item || userResult.Item.orgId !== orgId) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: "User is not associated with the specified Organization" }),
            };
        }

        const shopId = randomUUID();

        await dynamoDb.send(new PutCommand({
            TableName: shopTable,
            Item: {
                id: shopId,
                org_id: orgId,
                square_id,
                square_location_id,
                name,
                phone,
                location,
                latitude,
                longitude,
                geohash,
                shop_hours,
                active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
        }));


        /* await dynamoDb.send(new UpdateCommand({
             TableName: orgTable,
             Key: { id: orgId },
             UpdateExpression: "SET shopId = :shopId",
             ExpressionAttributeValues: { ":shopId": shopId },
         }));*/

        return {
            statusCode: 201,
            body: JSON.stringify({ message: "Shop created successfully", shopId }),
        };
    } catch (error) {
        console.error("Error creating shop:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error" }),
        };
    }
};
