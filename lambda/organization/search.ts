import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    QueryCommand
} from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

interface Organization {
    id: string;
    name?: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const orgTable = process.env.ORG_TABLE;

    const searchQuery = event.queryStringParameters?.q?.trim();

    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 10;

    if (!orgTable) {
        return { statusCode: 500, body: JSON.stringify({ error: "Missing organization table environment variable" }) };
    }

    if (!searchQuery) {
        return { statusCode: 400, body: JSON.stringify({ error: "Search query is required" }) };
    }

    searchQuery.toLowerCase();

    try {
        const queryParams = new QueryCommand({
            TableName: orgTable,
            IndexName: "name-index",
            KeyConditionExpression: "begins_with(#org_name, :searchQuery)",
            ProjectionExpression: "id, #org_name",
            Limit: limit,
            ExpressionAttributeNames: {
                "#org_name": "name"
            },
            ExpressionAttributeValues: {
                ":searchQuery": searchQuery
            },

        });

        const result = await dynamoDb.send(queryParams);

        const organizations: Organization[] = result.Items as Organization[] || [];

        const response = {
            organizations,
            count: organizations.length
        };

        return {
            statusCode: 200,
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error("Error searching organizations:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to search organizations" })
        };
    }
};