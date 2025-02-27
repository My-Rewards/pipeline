import { DynamoDBClient, QueryCommandInput, ScanCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Request body is required" }),
        };
      }
    
    try {
        const { userSub } = JSON.parse(event.body);
        const OrgTable = process.env.ORG_TABLE
        const ShopTable = process.env.SHOP_TABLE

        if(!OrgTable){
            return { statusCode: 500, body: JSON.stringify({ error: "No Org Table" }) };
        }

        if (!userSub) {
            return { statusCode: 500, body: JSON.stringify({ error: "no userID supplied" }) };
        }

        const queryParams:QueryCommandInput = {
            TableName: OrgTable,
            FilterExpression: "owner = :user_id",
            ExpressionAttributeValues: {
                ":user_id": userSub,
            },
        }

        const results = await dynamoDb.send(new QueryCommand(queryParams));

        if (!results?.Items || results.Items.length === 0) {
            return { statusCode: 210, body: JSON.stringify({ info: "Organization not found" }) };
        }

        const organization = unmarshall(results.Items[0])
        const admin = organization.owner_id === userSub ? true : false;

        if (!organization || !organization.id) {
            return { statusCode: 210, body: JSON.stringify({ info: "Organization not found" }) };
        }

        if(!organization?.linked){
            return { 
                statusCode: 211, 
                body: JSON.stringify({ info:'Organization not Linked' })};
        }

        const shopQueryParams = {
            TableName: ShopTable,
            KeyConditionExpression: "#org = :orgId",
            ExpressionAttributeNames: {
              "#org": "org_id",
            },
            ExpressionAttributeValues: {
                ":org_id": organization.id,
            },
        };

        const shopResults = await dynamoDb.send(new ScanCommand(shopQueryParams));

        const shops = shopResults?.Items ? shopResults.Items.map(item => unmarshall(item)) : [];

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                organization: { 
                    OrgName:organization,
                },
                shops:shops, 
                admin 
            }),
        };

    } catch (error) {
        console.error("Error fetching organization:", error);
        return { statusCode: 500, body: JSON.stringify({ error }) };
    }
};
