import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {GetCommand, DynamoDBDocumentClient} from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

exports.handler = async (event:APIGatewayProxyEvent) => {
    console.log("Received Event: ", JSON.stringify(event, null, 2));

    const tableName = process.env.USERS_TABLE;
    const id = event.requestContext.authorizer?.claims?.sub;

    if (!id) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: "Missing required parameter: id",
            }),
        };
    }

    const params = {
        TableName: tableName,
        Key: {
            id,
        },
    };

    try {
        const result = await dynamoDb.send(new GetCommand(params));

        if (!result.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: `User with id '${id}' not found`,
                }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "User fetched successfully",
                user: result.Item,
            }),
        };
    } catch (error) {
        console.error("Error fetching user:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Could not fetch user",
                details: error,
            }),
        };
    }
};
