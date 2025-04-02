import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import Stripe from "stripe";
import { getStripeSecret } from "../../constants/validOrganization";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

let stripe: Stripe| null;
let cachedStripeKey: string | null; 


export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return { statusCode: 400, body: "Request body is required" };
  }

  const orgTable = process.env.ORG_TABLE;
  const userTable = process.env.USER_TABLE;
  const stripeArn = process.env.STRIPE_ARN;

  const userSub = event.requestContext.authorizer?.claims?.sub;

  switch(true){
    case (!orgTable || !userTable || !stripeArn):
      return { statusCode: 500, body: "Missing env variables" };
    case (!userSub):
      return { statusCode: 500, body: "Missing User id" };  
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

    const updates: Record<string, any> = { name, description, tags, rl_active, rm_active, rewards_loyalty, rewards_milestone};
    updates.updatedAt = new Date().toISOString();
    
    const validUpdates = Object.entries(updates).filter(([_, v]) => v !== undefined);

    if (validUpdates.length === 0) {
      return { statusCode: 400, body: "No valid attributes to update." };
    }

    const updateExpression = "SET " + validUpdates.map(([k]) => `#${k} = :${k}`).join(", ");
    const expressionAttributeNames = validUpdates.reduce((acc, [key]) => ({ ...acc, [`#${key}`]: key }), {});
    const expressionAttributeValues = validUpdates.reduce((acc, [key, value]) => ({ ...acc, [`:${key}`]: value }), {});

    const getUser = new GetCommand({
      TableName: userTable,
      Key: {id: userSub},
      ProjectionExpression: "orgId, #userPermissions",
      ExpressionAttributeNames: { 
        "#userPermissions": "permissions"
      }
    });
      
    const resultUser = await dynamoDb.send(getUser);
    
    if (!resultUser.Item?.orgId) {
      return { statusCode: 210, body: JSON.stringify({ info: "Organization not Found" }) };
    }
    
    const orgId = resultUser.Item.orgId;
    const permissions = resultUser.Item.permissions;

    const getOrg = new GetCommand({
        TableName: orgTable,
        Key: { id: orgId },
        ProjectionExpression: "stripe_id, linked",            
    });

    const org = await dynamoDb.send(getOrg);
    
    if (!org.Item) {
      return { statusCode: 210, body: JSON.stringify({ info: "Organization not found" }) };
    }

    const updateCommand = new UpdateCommand({
      TableName: orgTable,
      Key: { id: orgId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW"
    });

    const response = await dynamoDb.send(updateCommand);

    if (!cachedStripeKey) {
      cachedStripeKey = await getStripeSecret(stripeArn);
      if (!cachedStripeKey) return { statusCode: 404, body: JSON.stringify({ error: "Failed to retrieve Stripe secret key" }) };
    }
    if(!stripe){
      stripe = new Stripe(cachedStripeKey, { apiVersion: "2025-02-24.acacia" });
      if (!stripe) return { statusCode: 500, body: JSON.stringify({ error: "Failed to open stripe Client" }) };
    }

    if(name && org.Item.stripe_id && org.Item.linked){
      await stripe?.customers.update(org.Item.stripe_id,{
        name:name
      })
    }
    else{
      return { statusCode: 211, body: JSON.stringify({ info: "Organization not Linked" }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Update successful", updatedAttributes: response.Attributes }),
    };
  } catch (error) {
    console.error("Update failed:", error);
    return { statusCode: 500, body: JSON.stringify({ message: "Internal server error", error }) };
  }
};
