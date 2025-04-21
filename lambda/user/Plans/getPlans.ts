import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    QueryCommand,
    GetCommand,
    QueryCommandInput
} from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

interface Plan {
    userId: string;
    type: string;
    org_id:string;
    visits: number;
    visits_total:number;
    points_total:number;
    start_date:string;
    points: number;
    active: boolean;
    id: string;
}

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
    name: string|undefined,
    id: string|undefined,
    activePlan:boolean|undefined,
    active:boolean|undefined
    favorite:boolean|undefined;
}


export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const plansTable = process.env.PLANS_TABLE;
    const orgTable = process.env.ORG_TABLE;

    const userSub = event.requestContext.authorizer?.claims?.sub;

    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 20;
    const lastEvaluatedKey = event.queryStringParameters?.nextToken
        ? JSON.parse(decodeURIComponent(event.queryStringParameters.nextToken))
        : undefined;

    switch(true) {
        case (!plansTable || !orgTable):
            return { statusCode: 500, body: JSON.stringify({ error: "Missing table environment variables" }) };
        case (!userSub):
            return { statusCode: 400, body: JSON.stringify({ error: "User ID is required" }) };
    }

    try {
        const queryParams = new QueryCommand({
            TableName: plansTable,
            KeyConditionExpression: "user_id = :userId",
            ExpressionAttributeValues: {
                ":userId": userSub
            },
            Limit: limit,
        });


        const plansResult = await dynamoDb.send(queryParams);

        if (!plansResult.Items || plansResult.Items.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: "No plans found for this user",
                    plans: [],
                    count: 0
                })
            };
        }

        const plansMap: Record<string, GroupedPlan> = {};

        plansResult.Items.forEach((item) => {
            const plan = item as Plan;

            if (!plansMap[plan.org_id]) {
                plansMap[plan.org_id] = {
                    org_id: undefined,
                    visits: undefined,
                    points: undefined,
                    id: undefined,
                    reward_plan: {
                        rewards_loyalty: undefined,
                        rewards_milestone: undefined
                    }
                } as GroupedPlan;
            }

            plansMap[plan.org_id].org_id = plan.org_id;
            plansMap[plan.org_id].visits = plan.visits;
            plansMap[plan.org_id].points = plan.points;
            plansMap[plan.org_id].id = plan.id;


        });

        const enhancedPlans = await Promise.all(
            Object.values(plansMap).map(async (planGroup) => {
                const getOrg = new GetCommand({
                    TableName: orgTable,
                    Key: { id: planGroup.org_id },
                    ProjectionExpression: "id, #org_name, images, rm_active, rl_active, rewards_loyalty, rewards_milestone, active",
                    ExpressionAttributeNames: {
                        "#org_name": "name"
                    }
                });

                const orgResult = await dynamoDb.send(getOrg);
                const org = orgResult.Item;

                if (org) {
                    planGroup.name = org.name;
                    planGroup.id = org.id;
                    planGroup.banner = org.images.banner.url;
                    planGroup.logo = org.images.logo.url;

                    planGroup.rl_active = org.rl_active || false;
                    planGroup.rm_active = org.rm_active || false;

                   planGroup.activePlan = planGroup.activePlan || false;
                    planGroup.active = org.active;

                    planGroup.reward_plan={
                        rewards_milestone: org.rewards_milestone,
                        rewards_loyalty:org.rewards_loyalty
                    }

                    planGroup.redeemableRewards=[]
                    planGroup.favorite=false;

                } else {
                    planGroup.name = "Error";
                    planGroup.id = planGroup.org_id;
                    planGroup.logo = undefined;
                    planGroup.banner = undefined;
                    planGroup.rl_active = false;
                    planGroup.rm_active = false;
                    planGroup.redeemableRewards=[]
                    planGroup.favorite=false;
                    planGroup.reward_plan={
                        rewards_milestone:undefined,
                        rewards_loyalty:undefined
                    }

                }

                return planGroup;
            })
        );

        const response = {
            plans: enhancedPlans,
            count: enhancedPlans.length,
            pagination: {
                hasMore: !!plansResult.LastEvaluatedKey,
                nextToken: plansResult.LastEvaluatedKey
                    ? encodeURIComponent(JSON.stringify(plansResult.LastEvaluatedKey))
                    : null
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