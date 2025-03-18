const {DynamoDBClient} = require("@aws-sdk/client-dynamodb");
const {DeleteCommand, DynamoDBDocumentClient} = require("@aws-sdk/lib-dynamodb");
import {APIGatewayProxyEvent} from "aws-lambda"

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

exports.handler = async (event: APIGatewayProxyEvent) => {
    console.log("Received Event: ", JSON.stringify(event, null, 2));

    const tableName = process.env.USERS_TABLE;
    const {id} = event.queryStringParameters || {};

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
        ReturnValues: "ALL_OLD",
    };

    try {
        const result = await dynamoDb.send(new DeleteCommand(params));
        

        if (!result.Attributes) {
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
                message: "User deleted successfully",
                user: result.Attributes,
            }),
        };

    } catch(e) {
        console.error("Error deleting user:", e);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Could not delete user",
                details: e,
            }),
        };
    }
};