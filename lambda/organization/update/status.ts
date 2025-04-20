import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import Stripe from "stripe";
import { dfPM, getStripeSecret } from "../../constants/validOrganization";
import { STRIPE_API_VERSION } from "../../../global/constants";
import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const rdsClient = new RDSDataClient({ region: "us-east-1" });

let stripe: Stripe| null;
let cachedStripeKey: string | null; 

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const orgTable = process.env.ORG_TABLE;
    const userTable = process.env.USER_TABLE;
    const stripeArn = process.env.STRIPE_ARN;
    const clusterSecretArn = process.env.CLUSTER_SECRET_ARN
    const clusterArn = process.env.CLUSTER_ARN
    const dbName = process.env.DB_NAME

  const userSub = event.requestContext.authorizer?.claims?.sub;

  switch(true){
    case (!orgTable || !userTable || !stripeArn): return { statusCode: 500, body: "Missing env variables in ENV" };
    case (!userSub): return { statusCode: 500, body: "Missing User id in ENV" };
    case !clusterSecretArn: return{statusCode:404, body:'Missing Aurora Secret ARN in ENV'};
    case !clusterArn: return{statusCode:404, body:'Missing Aurora ARN in ENV'};
    case !dbName: return{statusCode:404, body:'Missing DB Name in ENV'};
  }
  const dateNow = new Date();

  try {
    const getUser = new GetCommand({
      TableName: userTable,
      Key: {id: userSub},
      ProjectionExpression: "org_id, #userPermissions",
      ExpressionAttributeNames: { 
        "#userPermissions": "permissions"
      }
    });
      
    const resultUser = await dynamoDb.send(getUser);
    
    if (!resultUser.Item?.org_id) {
      return { statusCode: 210, body: JSON.stringify({ info: "Organization not Found" }) };
    }
    
    const orgId = resultUser.Item.org_id;
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
            UpdateExpression: 'SET active = :active, updated_at = :updatedAt',
            ExpressionAttributeValues: {
            ':active': !org.Item.active,
            ':updatedAt': dateNow.toISOString()
            },
            ReturnValues: 'UPDATED_NEW'
        });

        const auroraResult = await rdsClient.send(
            new ExecuteStatementCommand({
                secretArn: clusterSecretArn,
                resourceArn: clusterArn,
                database: dbName,
                sql:`
                    UPDATE Organizations SET active = :active WHERE id = :orgId
                `,
                parameters: [
                    { name: "active", value: { booleanValue: !org.Item.active } },
                    { name: "orgId", value: { stringValue: orgId } }
                ],
            })
        );

        if(auroraResult.numberOfRecordsUpdated ?? 0 >= 1){
            await dynamoDb.send(updateOrg);
        }

        status = !org.Item.active
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
