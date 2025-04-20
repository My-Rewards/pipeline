const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { GetCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
import { APIGatewayProxyEvent } from "aws-lambda";

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

exports.handler = async (event:APIGatewayProxyEvent) => {
    console.log("Received Event: ", JSON.stringify(event, null, 2));

    const tableName = process.env.VISITS_TABLE;
    const { id } = event.queryStringParameters || {};

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
            id: id,
        },
    };
    console.log(params);

    try {
        const result = await dynamoDb.send(new GetCommand(params));

        if (!result.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: `Visit with id '${id}' not found`,
                }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Visit fetched successfully",
                visit: result.Item,
            }),
        };
    } catch (error) {
        console.error("Error fetching visit:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Could not fetch visit",
                details: error,
                tablename: tableName
            }),
        };
    }
};
