import { DynamoDBClient} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { OrganizationProps, ShopProps } from "../Interfaces";

const dynamoClient = new DynamoDBClient({region: "us-east-1"});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const userSub = event.queryStringParameters?.userSub;

    try {
        const orgTable = process.env.ORG_TABLE
        const shopTable = process.env.SHOP_TABLE
        const userTable = process.env.USER_TABLE

        switch(true){
            case (!orgTable || !shopTable): return { statusCode: 404, body: JSON.stringify({ error: "No Org/Shop Table" }) };
            case (!userSub): return { statusCode: 404, body: JSON.stringify({ error: "no userID supplied" }) };
        }
        
        const getUser = new GetCommand({
            TableName: userTable,
            Key: { id: userSub },
            ProjectionExpression: "org_id",
          });
          
        const resultOrgId = await dynamoDb.send(getUser);
        
        if (!resultOrgId.Item?.org_id) {
            return { statusCode: 212, body: JSON.stringify({ info: "User not found" }) };
        }
        
        const orgId = resultOrgId.Item.org_id;

        const getOrg = new GetCommand({
            TableName: orgTable,
            Key: { id: orgId },
          });
        

        const resultOrg = await dynamoDb.send(getOrg);
        
        if (!resultOrg.Item) {
            return { statusCode: 210, body: JSON.stringify({ info: "Organization not found" }) };
        }

        const organization = resultOrg.Item as OrganizationProps;

        const admin = organization.owner_id === userSub ? true : false;

        if(!organization?.linked){
            return { 
                statusCode: 211, 
                body: JSON.stringify({ info:'Organization not Linked' })
            };
        }

        const queryShops = new QueryCommand({
            TableName: shopTable,
            IndexName: "OrgIndex",
            KeyConditionExpression: "org_id = :orgId",
            ExpressionAttributeValues: {
              ":orgId": orgId,
            }
          });

        const shopResults = await dynamoDb.send(queryShops);

        if (!shopResults.Items) {
            return { statusCode: 212, body: JSON.stringify({ info: "Error Fetching Shops" }) };
        }

        const shops = shopResults.Items as ShopProps[];

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                organization:
                { 
                    id:organization.id,
                    name:organization.name,
                    description:organization.description,
                    images:organization.images,
                    date_registered: organization.date_registered,
                    paymentSetup:false, 
                    rewards_loyalty:organization.rewards_loyalty,
                    rewards_milestone:organization.rewards_milestone,
                    rl_active: organization.rl_active,
                    rm_active: organization.rm_active,
                    active: organization.active,
                    shops:shops,
                    admin 
                }
            }),
        };

    } catch (error) {
        console.error("Error fetching organization:", error);
        return { statusCode: 501, body: JSON.stringify({ error, info:'Something went wrong' }) };
    }
};
