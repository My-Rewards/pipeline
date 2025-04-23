import {Square, SquareClient, SquareEnvironment} from 'square';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {DecryptCommand, KMSClient} from '@aws-sdk/client-kms';
import {randomUUID} from "crypto";
import {OrganizationProps, PlanProps, ShopProps, VisitProps} from '../Interfaces';
import {ExecuteStatementCommand, RDSDataClient } from '@aws-sdk/client-rds-data';

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);
const kmsClient = new KMSClient({});
const rdsClient  = new RDSDataClient({});

const shopsTable = process.env.SHOPS_TABLE;
const organizationsTable = process.env.ORGANIZATIONS_TABLE;
const plansTable = process.env.PLANS_TABLE;
const visitsTable = process.env.VISITS_TABLE;
const appEnv = process.env.APP_ENV;
const secretArn = process.env.SECRET_ARN;
const resourceArn = process.env.CLUSTER_ARN;
const database = process.env.DB_NAME;

const scanWindow = 3; // Amount of time user has to scan order after they pay (minutes)

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log("Handler started");
    console.log("Event received: ", JSON.stringify(event, null, 2));

    try {
        validateEnvVariables();
        const { shop_id, timestamp } = parseAndValidateInput(event);
        console.log(`Received shop_id: ${shop_id}, timestamp: ${timestamp}`);

        const user_id = event.requestContext.authorizer?.claims?.sub;
        if(!user_id) throw new Error(
            `Missing user id in request`
        )

        const shop = await getShop(shop_id);
        const organization = await getOrg(shop.org_id);
        if(!organization.access_token) throw new Error(
            `Missing access token for organization ${shop.org_id}`
        )

        const decryptedSquareToken = await decryptKMS(organization.access_token);
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
        !process.env.KMS_KEY_ID ||
        !process.env.APP_ENV ||
        !process.env.DB_NAME ||
        !process.env.CLUSTER_ARN ||
        !process.env.SECRET_ARN) {
        throw new Error("Missing required environment variables");
    }
}

function parseAndValidateInput(event: APIGatewayProxyEvent): { shop_id: string; timestamp: string } {
    const { shop_id, timestamp } = event.queryStringParameters || {};
    if ( !shop_id || !timestamp) {
        throw new Error(`Missing required attributes: shop_id: ${shop_id}, timestamp: ${timestamp}`);
    }

    return { shop_id, timestamp };
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

async function decryptKMS(encryptedToken:string) {
    try {
        const encryptedBuffer = Buffer.from(encryptedToken, "hex");

        const command = new DecryptCommand({
            CiphertextBlob: encryptedBuffer,
            KeyId: process.env.KMS_KEY_ID
        });

        const { Plaintext } = await kmsClient.send(command);
        return new TextDecoder().decode(Plaintext);

    } catch (error) {
        console.error("KMS Decryption Error:", error);
        throw new Error("Failed to decrypt Square API token.");
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

export async function createNewPlan(user_id: string, org_id: string): Promise<string> {
    const planId    = randomUUID();
    const startDate = new Date().toISOString();

    const newPlan: PlanProps = {
        id:           planId,
        user_id,
        org_id,
        start_date:   startDate,
        visits:       0,
        visits_total: 0,
        points:       0,
        points_total: 0,
    };

    const result = await rdsClient.send(new ExecuteStatementCommand({
        resourceArn: resourceArn,
        secretArn:   secretArn,
        database:    database,
        sql: `
          INSERT INTO Plans (id, user_id, organization_id)
          VALUES (:planId, :userId, :orgId);
        `,
        parameters: [
            { name: "planId",   value: { stringValue: planId   } },
            { name: "userId",   value: { stringValue: user_id } },
            { name: "orgId",    value: { stringValue: org_id  } },
        ]
    }));

    if(result.numberOfRecordsUpdated !== 1) throw new Error()

    await dynamoDb.send(new PutCommand({
        TableName: process.env.PLANS_TABLE!,
        Item:      newPlan
    }));

    return planId;
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
    decryptKMS,
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
