import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";
import {
    RDSDataClient,
    ExecuteStatementCommand,
} from "@aws-sdk/client-rds-data";


const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);
const rdsClient = new RDSDataClient({});

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
            square_location_id,
            menu
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
            ProjectionExpression: "org_id, #userPermissions",
            ExpressionAttributeNames: { "#userPermissions": "permissions" },
        });
        const resultUser = await dynamoDb.send(getUser);

        if (!resultUser.Item) {
            return { statusCode: 210, body: JSON.stringify({ error: "User email not found in database or User already linked to Organization" }) };
        } else if (!resultUser.Item.org_id) {
            return { statusCode: 210, body: JSON.stringify({ error: "Organization not found" }) };
        }

        const org_id = resultUser.Item.org_id;


        const orgResult = await dynamoDb.send(new GetCommand({
            TableName: orgTable,
            Key: { id: org_id },
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
            ProjectionExpression: "org_id",
        }));
        if (!userResult.Item || userResult.Item.org_id !== org_id) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: "User is not associated with the specified Organization" }),
            };
        }

        const shopId = randomUUID();
        await rdsClient.send(
            new ExecuteStatementCommand({
                secretArn: process.env.SECRET_ARN!,
                resourceArn: process.env.CLUSTER_ARN!,
                database: process.env.DB_NAME!,
                sql: `
      INSERT INTO Shops (id, organization_id, location)
      VALUES (:shopId, :orgId, ST_MakePoint(:lon, :lat)::geography)
    `,
                parameters: [
                    { name: "shopId", value: { stringValue: shopId } },
                    { name: "orgId", value: { stringValue: org_id } },
                    { name: "lat", value: { doubleValue: latitude } },
                    { name: "lon", value: { doubleValue: longitude } },
                ],
            })
        );

        await dynamoDb.send(new PutCommand({
            TableName: shopTable,
            Item: {
                id: shopId,
                org_id: org_id,
                square_id,
                square_location_id,
                name,
                phone,
                location,
                latitude,
                longitude,
                geohash,
                shop_hours,
                menu,
                active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
        }));


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