import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Validate request body
  if (!event.body) {
    return { statusCode: 400, body: "Request body is required" };
  }


  const { ORG_TABLE, USER_TABLE, SHOP_TABLE } = process.env;
  const userSub = event.requestContext.authorizer?.claims?.sub;

  if (!ORG_TABLE || !USER_TABLE || !SHOP_TABLE) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing env variables" }) };
  }
  if (!userSub) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing User id" }) };
  }

  try {
   
    const {
      name,
      description,
      tags,
      rl_active,
      rm_active,
      rewards_loyalty,
      rewards_milestone
    } = JSON.parse(event.body);

    
    const updates: Record<string, any> = {
      name,
      description,
      tags,
      rl_active,
      rm_active,
      rewards_loyalty,
      rewards_milestone,
      updatedAt: new Date().toISOString(),
    };

    const validUpdates = Object.entries(updates).filter(([_, v]) => v !== undefined);
    if (validUpdates.length === 0) {
      return { statusCode: 400, body: "No valid attributes to update." };
    }

    const updateExpression = "SET " + validUpdates.map(([k]) => `#${k} = :${k}`).join(", ");
    const expressionAttributeNames = validUpdates.reduce((acc, [key]) => {
      acc[`#${key}`] = key;
      return acc;
    }, {} as Record<string, string>);
    const expressionAttributeValues = validUpdates.reduce((acc, [key, value]) => {
      acc[`:${key}`] = value;
      return acc;
    }, {} as Record<string, any>);

    const getUserCommand = new GetCommand({
      TableName: USER_TABLE,
      Key: { id: userSub },
      ProjectionExpression: "orgId, #userPermissions",
      ExpressionAttributeNames: {
        "#userPermissions": "permissions",
      },
    });
    const userResult = await dynamoDb.send(getUserCommand);
    if (!userResult.Item?.orgId) {
      return { statusCode: 210, body: JSON.stringify({ info: "Organization not Found" }) };
    }
    const orgId = userResult.Item.orgId;
    const getOrgCommand = new GetCommand({
      TableName: ORG_TABLE,
      Key: { id: orgId },
      ProjectionExpression: "linked",
    });
    const orgResult = await dynamoDb.send(getOrgCommand);
    if (!orgResult.Item) {
      return { statusCode: 210, body: JSON.stringify({ info: "Organization not found" }) };
    }
    if (!orgResult.Item.linked) {
      return { statusCode: 211, body: JSON.stringify({ info: "Organization not Linked" }) };
    }

    const updateCommand = new UpdateCommand({
      TableName: ORG_TABLE,
      Key: { id: orgId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    });
    const updateResponse = await dynamoDb.send(updateCommand);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Update successful",
        updatedAttributes: updateResponse.Attributes,
      }),
    };
  } catch (error) {
    console.error("Update failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal server error",
        error: error instanceof Error ? error.message : error,
      }),
    };
  }
};
