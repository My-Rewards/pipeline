import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, GetCommand} from "@aws-sdk/lib-dynamodb";
import {ExecuteStatementCommand, Field, RDSDataClient} from "@aws-sdk/client-rds-data";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const rdsClient = new RDSDataClient({});

interface GroupedPlan {
    reward_plan:
        {
            rewards_loyalty: any|undefined,
            rewards_milestone: any|undefined,
        },
    visits: number|undefined,
    points: number|undefined,
    redeemableRewards: string[]|undefined,
    rl_active:boolean|undefined,
    rm_active:boolean|undefined,
    banner: string|undefined,
    logo: string|undefined,
    org_id: string|undefined,
    shop_id: string|undefined,
    name: string|undefined,
    id: string|undefined,
    activePlan:boolean|undefined,
    active:boolean|undefined
    favorite:boolean|undefined;
}

const plansTable = process.env.PLANS_TABLE;
const orgTable = process.env.ORG_TABLE;
const secretArn = process.env.SECRET_ARN;
const resourceArn = process.env.CLUSTER_ARN;
const database = process.env.DB_NAME;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {

    const userSub = event.requestContext.authorizer?.claims?.sub;
    const { lat, lon } = event.queryStringParameters || {};

    const page = parseInt(event.queryStringParameters?.page || "1", 10);
    const limit = parseInt(event.queryStringParameters?.limit || "20", 10);
    const offset = (page - 1) * limit;

    try {
        const latitude = parseFloat(lat || '39');
        const longitude = parseFloat(lon || '-98');

        validateEnv()

        const records = await auroraCall(latitude, longitude, userSub, limit, offset);

        const enhancedPlans = await enrichList(records, userSub);

        const response = {
            plans: enhancedPlans,
            count: enhancedPlans.length,
            pagination: {
                currentPage: page,
                limit,
                hasMore: enhancedPlans.length === limit,
                nextPage: enhancedPlans.length === limit ? page + 1 : null
            }
        };

        return {
            statusCode: 200,
            body: JSON.stringify(response)
        };
    } catch (error) {
        console.error("Error fetching plans:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Failed to fetch plans",
                details: error
            })
        };
    }
};

function validateEnv() {
    if (!plansTable || !orgTable || !secretArn || !resourceArn || !database) {
        throw new Error("Missing env values");
    }
}

async function auroraCall(lat: number, lng: number, userSub:string, limit: number, offset: number) {
    const auroraResult = await rdsClient.send(
        new ExecuteStatementCommand({
            secretArn: secretArn,
            resourceArn: resourceArn,
            database: database,
            sql: `
                    SELECT 
                      p.id,
                      p.organization_id,
                      s.id AS shop_id,
                      CASE 
                        WHEN l.user_id IS NOT NULL THEN TRUE ELSE FALSE 
                      END AS favorite
                    FROM plans p
                      JOIN organizations o
                        ON o.id = p.organization_id
                       AND o.active = TRUE
                      JOIN LATERAL (
                        SELECT s.id, s.location
                        FROM shops s
                        WHERE s.organization_id = p.organization_id AND s.active = TRUE
                        ORDER BY ST_Distance(s.location, ST_MakePoint(:lon, :lat)::geography)
                        LIMIT 1
                      ) s ON true
                      LEFT JOIN orgLikes l ON l.organization_id = p.organization_id AND l.user_id = :userId
                        WHERE p.user_id = :userId
                    LIMIT :limit OFFSET :offset;
                `,
            parameters: [
                { name: "lat", value: { doubleValue: lat } },
                { name: "lon", value: { doubleValue: lng } },
                { name: "userId", value: { stringValue: userSub } },
                { name: "limit", value: { longValue: limit } },
                { name: "offset", value: { longValue: offset } },
            ],
        })
    );

    return auroraResult.records ?? [];
}

async function enrichList(records:Field[][], userSub:string): Promise<GroupedPlan[]> {

    return  await Promise.all(
        records.map(async (row) => {
            const planId = row[0].stringValue;
            const orgId = row[1].stringValue;
            const shopId = row[2].stringValue;
            const favorite = row[3].booleanValue!;

            const [planRes, orgRes] = await Promise.all([
                dynamoDb.send(new GetCommand({
                    TableName: plansTable,
                    Key: {
                        user_id: userSub,
                        org_id: orgId
                    }
                })),
                dynamoDb.send(new GetCommand({
                    TableName: orgTable,
                    Key: {id: orgId},
                    ProjectionExpression: "id, #name, images, rm_active, rl_active, rewards_loyalty, rewards_milestone",
                    ExpressionAttributeNames: {"#name": "name"}
                })),
            ]);

            const plan = planRes.Item;
            const org = orgRes.Item;

            return {
                id: planId,
                org_id: orgId,
                shop_id: shopId,
                plan,
                org,
                banner: org?.images?.banner?.url,
                logo: org?.images?.logo?.url,
                name: org?.name,
                rl_active: org?.rl_active ?? false,
                rm_active: org?.rm_active ?? false,
                active: org?.active ?? false,
                reward_plan: {
                    rewards_loyalty: org?.rewards_loyalty,
                    rewards_milestone: org?.rewards_milestone
                },
                visits: plan?.visits ?? 0,
                points: plan?.points ?? 0,
                activePlan: plan?.active ?? false,
                redeemableRewards: [],
                favorite
            };
        })
    )
}
