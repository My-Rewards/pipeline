import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import Stripe from "stripe";
import { dfPM, getStripeSecret } from "../../constants/validOrganization";
import { STRIPE_API_VERSION } from "../../../global/constants";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

let stripe: Stripe| null;
let cachedStripeKey: string | null; 

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
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
        ProjectionExpression: "linked, active, stripe_id",            
    });

    const org = await dynamoDb.send(getOrg);
    
    if (!org.Item) {
        return { statusCode: 210, body: JSON.stringify({ info: "Organization not found" }) };
    }

    if(!org.Item.linked){
        return { statusCode: 211, body: JSON.stringify({ info: "Organization not Linked" }) };
    }

    if (!cachedStripeKey) {
        cachedStripeKey = await getStripeSecret(stripeArn);
        if (!cachedStripeKey) return { statusCode: 404, body: JSON.stringify({ error: "Failed to retrieve Stripe secret key" }) };
    }
    if(!stripe){
        stripe = new Stripe(cachedStripeKey, { apiVersion: STRIPE_API_VERSION });
        if (!stripe) return { statusCode: 500, body: JSON.stringify({ error: "Failed to open stripe Client" }) };
    }

    let status = org.Item.active;
    const hasDfPM = await dfPM(org.Item.stripe_id, stripe);

    if(hasDfPM){
        const updateOrg = new UpdateCommand({
            TableName: orgTable,
            Key: { id: orgId },
            UpdateExpression: 'SET active = :active, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
            ':active': !org.Item.active,
            ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'UPDATED_NEW'
        });
        status = !org.Item.active
    
        await dynamoDb.send(updateOrg);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Update successful", active: status, defaultPaymentMethod: hasDfPM }),
    };
  } catch (error) {
    console.error("Update failed:", error);
    return { statusCode: 500, body: JSON.stringify({ message: "Internal server error", error }) };
  }
};
