import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {UpdateCommand, DynamoDBDocumentClient} from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { updateUserSchema } from "@/utils/validation/validationTypes";
import { ZodError } from "zod";
const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

const userTable = process.env.USERS_TABLE;

exports.handler = async (event: APIGatewayProxyEvent) => {
    const userSub = event.requestContext.authorizer?.claims?.sub;

    const params = new UpdateCommand({
        TableName: userTable,
        Key: { id:userSub },
        UpdateExpression: 'SET newAccount = :accountStatus',
        ExpressionAttributeValues: {':accountStatus':false}
    });

    try {
        const result = await dynamoDb.send(params);

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
