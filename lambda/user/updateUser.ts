const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { UpdateCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
import { APIGatewayProxyEvent } from "aws-lambda";

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

exports.handler = async (event: APIGatewayProxyEvent) => {
    console.log("Received Event: ", JSON.stringify(event, null, 2));

    const tableName = process.env.USERS_TABLE;
    const id = event.requestContext.authorizer?.claims?.sub;
    const body = event.body ? JSON.parse(event.body) : null;

    if (!id) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing required parameter: id" }),
        };
    }

    if (!body || typeof body !== "object" || !body.fullname) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Invalid or missing request body. Expected 'fullname' object." }),
        };
    }

    const { firstName, lastName } = body.fullname;
    if (!firstName && !lastName) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "At least one of 'firstName' or 'lastName' must be provided." }),
        };
    }

    const updateExpressionParts = [];
    const expressionAttributeValues: Record<string, any> = {};
    const expressionAttributeNames: Record<string, string> = { "#fullname": "fullname" };

    if (firstName !== undefined) {
        updateExpressionParts.push("#fullname.#firstName = :firstName");
        expressionAttributeValues[":firstName"] = firstName;
        expressionAttributeNames["#firstName"] = "firstName";
    }
    if (lastName !== undefined) {
        updateExpressionParts.push("#fullname.#lastName = :lastName");
        expressionAttributeValues[":lastName"] = lastName;
        expressionAttributeNames["#lastName"] = "lastName";
    }

    const updateExpression = `SET ${updateExpressionParts.join(", ")}`;

    const params = {
        TableName: tableName,
        Key: { id },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        ReturnValues: "UPDATED_NEW",
    };

    try {
        const result = await dynamoDb.send(new UpdateCommand(params));

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "User updated successfully",
                user: result.Attributes,
            }),
        };
    } catch (e) {
        console.error("Error updating user:", e);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Could not update user",
                details: e instanceof Error ? e.message : "Unknown error",
            }),
        };
    }
};
