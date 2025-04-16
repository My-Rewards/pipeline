import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DeleteCommandInput, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {APIGatewayProxyEvent} from "aws-lambda"

import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";
const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

exports.handler = async (event: APIGatewayProxyEvent) => {
    console.log("Received Event: ", JSON.stringify(event, null, 2));
    const cognitoClient = new CognitoIdentityProviderClient({});
    const tableName = process.env.USERS_TABLE;
    const id = event.requestContext.authorizer?.claims?.sub;
    const userPoolId = process.env.USER_POOL_ID; 
    if (!id) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: "Missing required parameter: id",
            }),
        };
    }

    const params: DeleteCommandInput = {
        TableName: tableName,
        Key: {
            id,
        }
    };

    try {
        const cognitoParams = {
            UserPoolId: userPoolId,
            Username: id, 
        };
        await cognitoClient.send(new AdminDeleteUserCommand(cognitoParams));

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