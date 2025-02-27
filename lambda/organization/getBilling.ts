import { DynamoDBClient, QueryCommandInput } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { OrganizationProps } from "../Interfaces";

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

        if(!OrgTable){
            return { statusCode: 404, body: JSON.stringify({ error: "No Org Table" }) };
        }

        if (!userSub) {
            return { statusCode: 404, body: JSON.stringify({ error: "no userID supplied" }) };
        }

        const queryParams:QueryCommandInput = {
            TableName: OrgTable,
            FilterExpression: "owner = :user_id OR contains(members, :user_id)",
            ExpressionAttributeValues: {
                ":user_id": userSub,
            }
        }

        const results = await dynamoDb.send(new QueryCommand(queryParams));

        const organization = results.Items?.length ? (unmarshall(results.Items[0]) as OrganizationProps) : null;

        if (!organization) {
            return { statusCode: 210, body: JSON.stringify({ info: "Organization not found" }) };
        }

        const admin = organization.owner_id === userSub ? true : false;

        if(!organization?.linked){
            return { statusCode: 211, body: JSON.stringify({ info: "Organization not Linked" }) };
        }

        return { statusCode: 200, body: JSON.stringify({ 
            organization: { 
                stripe_id: organization.stripe_id,
                name: organization.name,
                desciprtion:organization.description,
                
                admin
            }
        })};

    } catch (error) {
        console.error("Error fetching organization:", error);
        return { statusCode: 500, body: JSON.stringify({ error }) };
    }
};
