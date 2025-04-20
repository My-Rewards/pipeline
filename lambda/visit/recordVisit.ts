import { Square, SquareClient, SquareEnvironment } from 'square';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';
import { randomUUID } from "crypto";
import { ShopProps, VisitProps, OrganizationProps, PlanProps } from '../Interfaces';
import { json } from 'stream/consumers';

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);
const kmsClient = new KMSClient({});
const shopsTable = process.env.SHOPS_TABLE;
const organizationsTable = process.env.ORGANIZATIONS_TABLE;
const plansTable = process.env.PLANS_TABLE;
const visitsTable = process.env.VISITS_TABLE;
const appEnv = process.env.APP_ENV;
const scanWindow = 3; // Amount of time user has to scan order after they pay (minutes)

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log("Handler started");
    console.log("Event received: ", JSON.stringify(event, null, 2));

    try {
        validateEnvVariables();
        const { user_id, shop_id, timestamp } = parseAndValidateInput(event);
        const shop = await getShop(shop_id);
        const organization = await getOrg(shop.orgId);
        const decryptedSquareToken = await decryptToken(organization.accessToken);
        const orgSquareClient = await getOrgSquareClient(decryptedSquareToken);
        const mostRecentOrder = await getMostRecentOrder(shop, timestamp, orgSquareClient);
        if (mostRecentOrder == undefined) return visitNotFoundResponse();
        const visitData : VisitProps = {
            user_id: user_id,
            shop_id: shop.id,
            org_id: organization.id,
            order_id: mostRecentOrder.id || "",
            visitTimestamp: mostRecentOrder.createdAt || "",
            total: mostRecentOrder.netAmounts?.totalMoney?.amount || null,
            rl_active: organization.rl_active,
            rm_active: organization.rm_active,
        }

        const visitId = await recordVisit(visitData);
        await updatePlan(user_id, organization.id, mostRecentOrder.netAmounts?.totalMoney?.amount, organization.rm_active, organization.rl_active);
        return successResponse(visitId);
    } catch (error) {
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
        throw new Error(`Missing required attributes: user_id: ${user_id}, shop_id: ${shop_id}, timestamp: ${timestamp}`);
    }
    return { user_id, shop_id, timestamp };
}

async function getShop(shop_id: string): Promise<ShopProps> {
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
        console.log(`Received shop ${JSON.stringify(result.Item)}`);
        return result.Item as ShopProps;
    } catch (error) {
        throw new Error(`Error fetching shop: ${error}`);
    }
}

async function getOrg(organization_id: string): Promise<OrganizationProps> {
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
        console.log(`Received Organization ${JSON.stringify(result.Item)}`)
        return result.Item as OrganizationProps;
    } catch (error) {
        throw new Error(`Failed to fetch organization with id ${organization_id}: ${error}`)
    }
}

async function decryptToken(square_oauth_encrypted: string | null): Promise<string> {
    // Decrypts auth token using AWS kms
    if (square_oauth_encrypted == null) throw new Error("Can't decrypt empty token");

    let decryptedToken;
    try {
        const decryptParams = {
            CiphertextBlob: Buffer.from(square_oauth_encrypted, 'base64')
        }
        const decryptCommand = new DecryptCommand(decryptParams);
        const decryptResponse = await kmsClient.send(decryptCommand);
        if (!decryptResponse.Plaintext) {
            throw new Error('Error occured with kms while trying to decrypt token');
        }
        decryptedToken = Buffer.from(decryptResponse.Plaintext).toString();
        if (!decryptedToken) {
            throw new Error('Failed to decrypt token');
        }
        return decryptedToken;
    } catch (error) {
        throw new Error(`Failed to decrypt square oauth token: ${error}`);
    }
}

async function getOrgSquareClient(decryptedToken: string): Promise<SquareClient> {
    let squareClient;
    
    try {
        squareClient = new SquareClient({
            token: decryptedToken,
            environment: appEnv === 'prod' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
        }); 
        console.log("SquareClient initialized successfully");
        return squareClient;
    } catch (error) {
        throw new Error(`Error initializing SquareClient: ${error}`);
    }
}

async function getMostRecentOrder(shop: any, timestamp: string, squareClient: SquareClient): Promise<Square.Order | undefined> {
    
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
            throw new Error(`Received errors from Square: ${result.errors}`)
        }

        if (result.orders) {
            mostRecentOrder = result.orders.find(order => {
                return !order.refunds || order.refunds.length === 0;
              });
        }
        if (mostRecentOrder == undefined) {
            throw new Error(`No orders within ${scanWindow} minutes at shop with ID ${shop.id}`)
        }
        return mostRecentOrder;

    } catch (error) {
        throw new Error(`Error searching orders: ${error}`);
    }
}

async function recordVisit(visitData: VisitProps) {

    visitData.id = randomUUID();

    try {
        const putParams = {
            TableName: visitsTable,
            Item: visitData,
            ConditionExpression: 'attribute_not_exists(id)',
        };

        await dynamoDb.send(new PutCommand(putParams));
        return visitData.id;
    } catch (error) {
        throw new Error(`Failed to record visit in DynamoDB: ${error}`);
    }
}

async function createNewPlan(user_id: string, org_id: string) {
    // Create new loyalty plan
    const newPlanId = randomUUID();
    const newPlan: PlanProps = {
        user_id: user_id,
        org_id: org_id,
        id: newPlanId,
        start_date: new Date().toISOString(),
        visits: 0,
        visits_total: 0,
        points: 0,
        points_total: 0,
    }

    const newLoyaltyPlan = {
        TableName: plansTable,
        Item: newPlan
    };
    try {
        await dynamoDb.send(new PutCommand(newLoyaltyPlan));
    } catch (error) {
        throw new Error(`Failed to create new plan for user ${user_id} at org ${org_id} with error: ${error}`)
    }
}

async function updatePlan(user_id: string, org_id: string, amount_spent: bigint | null | undefined, rm_active: boolean, rl_active: boolean) {
    if (!amount_spent) amount_spent = 0n;

    let plansResult = await getPlanByUserAndOrg(user_id, org_id);
    if (!plansResult) {
        createNewPlan(user_id, org_id);
    }
    
    const plansKey = {
        PK: user_id,
        SK: org_id
    };

    const visitValue = Number(amount_spent ?? 0) / 100.0;
    let updateExpression = generateUpdateExpression(rm_active, rl_active);
    const updateParams = {
        TableName: plansTable,
        Key: plansKey,
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: {
            ":rm_inc": visitValue,
            ":rl_inc": 1
        },
        ReturnValues: "ALL_NEW" as const
    };
    try {
        await dynamoDb.send(new UpdateCommand(updateParams));
    } catch (error) {
        throw new Error(`Failed to update plan for user ${user_id} with org ${org_id} with error: ${error}`)
    }
    console.log(`Successfully updated expenditure rewards plan for plan with key PK: ${plansKey.PK} SK: ${plansKey.SK}`);
}

async function getPlanByUserAndOrg(user_id: string, org_id: string): Promise<PlanProps | null> {
    const plansKey = {
        PK: user_id,
        SK: org_id
    };
    
    try {
        let plansResult = await dynamoDb.send(new GetCommand({
            TableName: plansTable,
            Key: plansKey
        }));
        return plansResult.Item ? plansResult.Item as PlanProps : null;
    } catch (error) {
        throw new Error("Failed to connect to plans table")
    }
}

function generateUpdateExpression(rm_active: boolean, rl_active: boolean) {
    let updateExpression = rm_active ? "SET points_total = points_total + :rm_inc, points = points + :rm_inc"
    : "SET points_total = points_total + :rm_inc";
    updateExpression += rl_active ? "SET visits_total = visits_total + :rm_inc, visits = visits + :rm_inc"
    : "SET visits_total = visits_total + :rl_inc";
    return updateExpression;
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
    updatePlan,
    getPlanByUserAndOrg,
    generateUpdateExpression,
    successResponse,
    visitNotFoundResponse,
    errorResponse
}