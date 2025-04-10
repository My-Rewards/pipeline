import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub;
    if (!userSub) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing user id in request" })
      };
    }

    const userTable = process.env.USER_TABLE;
    if (!userTable) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "User table not configured" })
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing request body" })
      };
    }
    
    const { name, email } = JSON.parse(event.body);
    if (!name || !email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing name or email in request body" })
      };
    }

    const updateCommand = new UpdateCommand({
      TableName: userTable,
      Key: { id: userSub },
      UpdateExpression: "set fullName = :name",
      ExpressionAttributeValues: {
        ":name": name,
      },
      ReturnValues: "ALL_NEW",
    });

    const result = await dynamoDb.send(updateCommand);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Account updated successfully",
        updatedAttributes: result.Attributes,
      }),
    };
  } catch (error) {
    console.error("Error updating account:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Could not update account",
        details: error instanceof Error ? error.message : error,
      }),
    };
  }
};
