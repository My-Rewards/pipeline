import { Square, SquareClient, SquareEnvironment } from 'square';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';
import { randomUUID } from "crypto";

console.log("Starting function initialization");
const client = new DynamoDBClient({});
console.log("DynamoDB client initialized");
const dynamoDb = DynamoDBDocumentClient.from(client);
console.log("DynamoDB document client initialized");
const kmsClient = new KMSClient({});
console.log("KMS client initialized");
const shopsTable = process.env.SHOPS_TABLE;
const organizationsTable = process.env.ORGANIZATIONS_TABLE;
const plansTable = process.env.PLANS_TABLE;
const visitsTable = process.env.VISITS_TABLE;
const appEnv = process.env.APP_ENV;
const scanWindow = 3; // Amount of time user has to scan order after they pay (minutes)

exports.handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log("Handler started");
    console.log("Event received: ", JSON.stringify(event, null, 2));

    validateEnvVariables();
    const { user_id, shop_id, timestamp } = parseAndValidateInput(event);
    try {
        const shop = await getShop(shop_id);
        const organization = await getOrg(shop.orgId);
        const decryptedSquareToken = await decryptToken(organization.square_oauth_encrypted);        
        const orgSquareClient = await getOrgSquareClient(decryptedSquareToken);
        const mostRecentOrder = await getMostRecentOrder(shop, timestamp, orgSquareClient);
        if (mostRecentOrder == undefined) return visitNotFoundResponse();
        const visitId = await recordVisit(user_id, mostRecentOrder, shop);
        await recordLoyaltyReward(user_id, visitId, mostRecentOrder, shop, organization);
        await recordExpenditureReward(user_id, visitId, mostRecentOrder, shop, organization);
        return successResponse(visitId);
    } catch (error) {
        //console.error(`Error in handler: ${error}`);
        return errorResponse(error as Error);
    }
}; 

function validateEnvVariables(): void {
    if (!process.env.SHOPS_TABLE || 
        !process.env.ORGANIZATIONS_TABLE || 
        !process.env.PLANS_TABLE || 
        !process.env.VISITS_TABLE || 
        !process.env.APP_ENV) {
        throw new Error("Missing required environment variables");
    }
}

function parseAndValidateInput(event: APIGatewayProxyEvent): { user_id: string; shop_id: string; timestamp: string } {
    const { user_id, shop_id, timestamp } = event.queryStringParameters || {};
    if (!user_id || !shop_id || !timestamp) {
        //console.error("Missing required attributes:", { user_id, shop_id, timestamp });
        throw new Error("Missing required attributes: user_id, shop_id, timestamp");
    }
    return { user_id, shop_id, timestamp };
}

async function getShop(shop_id: string) {
    let shopsGetParams = {
        TableName: shopsTable,
        Key: {
            id: shop_id
        }
    }

    try {
        const result = await dynamoDb.send(new GetCommand(shopsGetParams));
        if (!result.Item) {
            throw new Error(`Shop with id '${shop_id}' not found`);
        }
        return result.Item;
    } catch (error) {
        console.error("Error fetching shop:", error);
        throw new Error(`Shop with id '${shop_id}' not found`);
    }
}

async function getOrg(organization_id: string) {
    let organizationsGetParams = {
        TableName: organizationsTable,
        Key: {
            id: organization_id
        }
    }

    try {
        const result = await dynamoDb.send(new GetCommand(organizationsGetParams));
        if (!result.Item) {
            throw new Error(`Organization with id '${organization_id}' not found`);
        }
        return result.Item;
    } catch (error) {
        //console.error("Error fetching organization:", error);
        throw new Error(`Failed to fetch organization with id ${organization_id}: ${error}`)
    }
}

async function decryptToken(square_oauth_encrypted: string) {
    // Once key is obtained from AWS, decrypt using KMS
    let decryptedToken;
    try {
        const decryptParams = {
            CiphertextBlob: Buffer.from(square_oauth_encrypted, 'base64')
        }
        const decryptCommand = new DecryptCommand(decryptParams);
        const decryptResponse = await kmsClient.send(decryptCommand);
        decryptedToken = Buffer.from(decryptResponse.Plaintext || '').toString();
        
        if (!decryptedToken) {
            throw new Error('Failed to decrypt token');
        }
        return decryptedToken;
    } catch (error) {
        //console.error("Error decrypting organization's square oauth token: ", error);
        throw new Error("Failed to decrypt square oauth token");
    }
}

async function getOrgSquareClient(decryptedToken: string) {
    let squareClient;
    
    try {
        squareClient = new SquareClient({
            token: decryptedToken,
            environment: appEnv === 'prod' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
        }); 
        console.log("SquareClient initialized successfully");
        return squareClient;
    } catch (error) {
        //console.error("Error initializing SquareClient:", error);
        throw new Error("Error establishing connection with square")
    }
}

async function getMostRecentOrder(shop: any, timestamp: string, squareClient: SquareClient) {
    
    // Get orders up to 3 minutes before
    let beginTime = new Date(new Date(timestamp).getTime() - scanWindow * 60 * 1000).toISOString();

    const searchOrdersRequest = {
        locationIds: [shop.square_location_id],
        query: {
            sort: {
                sortField: Square.SearchOrdersSortField.CreatedAt,
                sortOrder: Square.SortOrder.Desc
            },
            filter: {
                
                dateTimeFilter: {
                    createdAt: {
                        startAt: beginTime,
                        endAt: timestamp
                    }
                },
            },
        },
    };

    let mostRecentOrder;
    try {
        const result = await squareClient.orders.search(searchOrdersRequest);
        if (!result || result == undefined) {
            throw new Error("Failed to communicate with Square after establishing a initial connection");
        }

        if (result.errors) {
            //console.error('Error from Square:', result.errors);
            throw new Error(`Received errors from Square: ${result.errors}`)
        }

        if (result.orders) {
            mostRecentOrder = result.orders.find(order => {
                return !order.refunds || order.refunds.length === 0;
              });
        }
        return mostRecentOrder;

    } catch (error) {
        //console.error(`Error searching orders: ${error}`);
        throw new Error(`Error searching orders: ${error}`);
    }
}

async function recordVisit(user_id: string, mostRecentOrder: any, shop: any, ) {

    const visitId = randomUUID();
    const visitData = {
      id: visitId,
      user_id: user_id,
      orderId: mostRecentOrder.id,
      organizationId: shop.orgId,
      shop_id: shop.id,
      visitTimestamp: mostRecentOrder.createdAt,
      total: mostRecentOrder.totalMoney
    };

    try {
        const putParams = {
            TableName: visitsTable,
            Item: visitData,
            ConditionExpression: 'attribute_not_exists(id)',
        };

        await dynamoDb.send(new PutCommand(putParams));
        return visitId;
    } catch (error) {
        //console.error('Error recording visit:', error);
        throw new Error(`Failed to record visit in DynamoDB: ${error}`);
    }
}

async function recordLoyaltyReward(user_id: string, visitId: string, mostRecentOrder: any, shop: any, organization: any) {
    // Loyalty Rewards
    if (!organization.rl_active) return;

    const plansKeyLoyalty = {
        PK: user_id,
        SK: `${shop.orgId}#LOYALTY`,
    };
    const loyaltyPlanResult = await dynamoDb.send(new GetCommand({
        TableName: plansTable,
        Key: plansKeyLoyalty
    }));

    if (loyaltyPlanResult.Item) {
        // Update existing loyalty plan
        const updateParams = {
            TableName: plansTable,
            Key: plansKeyLoyalty,
            UpdateExpression: "SET currentValue = currentValue + :inc, lifetimeValue = lifetimeValue + :inc, visits = list_append(visits, :visit)",
            ExpressionAttributeValues: {
                ":inc": 1,
                ":visit": [visitId]
            },
            ReturnValues: "ALL_NEW" as const
        };
        try {
            await dynamoDb.send(new UpdateCommand(updateParams));
        } catch (error) {
            //console.error(`Failed to update loyalty plan for visit ${visitId}`);
            throw new Error(`Failed to update loyalty plan for visit ${visitId} with error: ${error}`)
        }
        console.log(`Successfully updated loyalty plan with key ${plansKeyLoyalty.PK}#${plansKeyLoyalty.SK}`);
    } else {
        // Create new loyalty plan
        const newPlanId = randomUUID();
        const newLoyaltyPlan = {
            TableName: plansTable,
            Item: {
                PK: user_id,
                SK: `${shop.orgId}#LOYALTY`,
                organizationId: shop.orgId,
                startDate: new Date().toISOString(),
                lifetimeValue: 1,
                currentValue: 1,
                favorite: false,
                visits: [visitId],
                type: "LOYALTY",
                id: newPlanId,
            }
        };
        try {
            await dynamoDb.send(new PutCommand(newLoyaltyPlan));
        } catch (error) {
            //console.error(`Failed to create new loyalty plan for visit ${visitId}`);
            throw new Error(`Failed to create new loyalty plan for visit ${visitId} with error: ${error}`)
        }
        console.log(`Successfully created new loyalty plan for user ${user_id} at shop ${shop.id} with plan id ${newPlanId}`);
    }
}

async function recordExpenditureReward(user_id: string, visitId: string, mostRecentOrder: any, shop: any, organization: any) {
    // Expenditure rewards
    if (!organization.rm_active) return;

    const plansKeyExpenditure = {
        PK: user_id,
        SK: `${shop.orgId}#EXPENDITURE`,
    };
    let plansResult;

    try {
        plansResult = await dynamoDb.send(new GetCommand({
            TableName: plansTable,
            Key: plansKeyExpenditure
        }));
    } catch (error) {
        throw new Error("Failed to connect to plans table")
    }

    const visitValue = Number(mostRecentOrder.netAmounts?.totalMoney?.amount ?? 0) / 10;
    if (plansResult.Item) {
        // Update existing rewards plan
        const updateParams = {
            TableName: plansTable,
            Key: plansKeyExpenditure,
            UpdateExpression: "SET lifetimeValue = lifetimeValue + :inc, currentValue = currentValue + :inc, visits = list_append(visits, :visit)",
            ExpressionAttributeValues: {
                ":inc": visitValue,
                ":visit": [visitId]
            },
            ReturnValues: "ALL_NEW" as const
        };
        try {
            await dynamoDb.send(new UpdateCommand(updateParams));
        } catch (error) {
            //console.error(`Failed to update expenditure plan for visit ${visitId}`);
            throw new Error(`Failed to update expenditure plan for visit ${visitId} with error: ${error}`)
        }
        console.log(`Successfully updated expenditure rewards plan for plan with key ${plansKeyExpenditure}##${plansKeyExpenditure.SK}`);
    } else {
        // Create new rewards plan
        const newPlanId = randomUUID();
        const newRewardsPlan = {
            TableName: plansTable,
            Item: {
                PK: user_id,
                SK: `${shop.orgId}#EXPENDITURE`,
                organizationId: shop.orgId,
                startDate: new Date().toISOString(),
                lifetimeValue: visitValue,
                currentValue: visitValue,
                favorite: false,
                visits: [visitId],
                type: "EXPENDITURE",
                id: newPlanId
            }
        };

        try {
            await dynamoDb.send(new PutCommand(newRewardsPlan));
        } catch (error) {
            //console.error(`Failed to create new expenditure plan for visit ${visitId}`);
            throw new Error(`Failed to create new expenditure plan for visit ${visitId} with error: ${error}`)
        }
        console.log(`Successfully created new expenditure plan for user ${user_id} at shop ${shop.id} with plan id ${newPlanId}`);
    }
}

function successResponse(visitId: string): APIGatewayProxyResult {
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "Visit recorded and plans updated successfully",
            visitId,
        }),
    };
}

function visitNotFoundResponse(): APIGatewayProxyResult {
    return {
        statusCode: 404,
        body: JSON.stringify({
            error: 'No recent order found within the specified time frame',
        }),
    };
}

function errorResponse(error: Error): APIGatewayProxyResult {
    return {
        statusCode: 500,
        body: JSON.stringify({
            error: error.message,
        }),
    };
}

export const _test = {
    validateEnvVariables,
    parseAndValidateInput,
    getShop,
    getOrg,
    decryptToken,
    getOrgSquareClient,
    getMostRecentOrder,
    recordVisit,
    recordLoyaltyReward,
    recordExpenditureReward,
    successResponse,
    visitNotFoundResponse,
    errorResponse
}