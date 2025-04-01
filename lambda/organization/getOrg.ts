import { DynamoDBClient} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { OrganizationProps, ShopProps } from "../Interfaces";

const dynamoClient = new DynamoDBClient({region: "us-east-1"});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const userSub = event.requestContext.authorizer?.claims?.sub;

    try {
        const orgTable = process.env.ORG_TABLE
        const shopTable = process.env.SHOP_TABLE
        const userTable = process.env.USER_TABLE

        switch(true){
            case (!orgTable || !shopTable): return { statusCode: 500, body: JSON.stringify({ error: "No Org/Shop Table" }) };
            case (!userSub): return { statusCode: 404, body: JSON.stringify({ error: "no userID supplied" }) };
        }
        
        const getUser = new GetCommand({
            TableName: userTable,
            Key: {id: userSub},
            ProjectionExpression: "orgId, #userPermissions",
            ExpressionAttributeNames: { 
                "#userPermissions": "permissions"
            },
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
          });
        
        const resultOrg = await dynamoDb.send(getOrg);
        
        if (!resultOrg.Item) {
            return { statusCode: 210, body: JSON.stringify({ info: "Organization not found" }) };
        }

        const organization = resultOrg.Item as OrganizationProps;

        if(!organization?.linked){
            return { 
                statusCode: 211, 
                body: JSON.stringify({ info:'Organization not Linked' })
            };
        }

        const queryShops = new QueryCommand({
            TableName: shopTable,
            IndexName: "OrgIndex",
            KeyConditionExpression: "orgId = :org_id",
            ExpressionAttributeValues: {
              ":org_id": orgId,
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
                    name:organization.name,
                    description:organization.description,
                    images:{
                        logo:organization.images.logo.url,
                        preview:organization.images.preview.url,
                        banner:organization.images.banner.url
                    },
                    date_registered: organization.date_registered,
                    tags:organization.tags,
                    paymentSetup:false, 
                    rewards_loyalty:organization.rewards_loyalty,
                    rewards_milestone:organization.rewards_milestone,
                    rl_active: organization.rl_active,
                    rm_active: organization.rm_active,
                    active: organization.active,
                    linked:organization.linked,
                    shops:shops
                }
            }),
        };

    } catch (error) {
        console.error("Error fetching organization:", error);
        return { statusCode: 501, body: JSON.stringify({ error, info:'Something went wrong' }) };
    }
};
