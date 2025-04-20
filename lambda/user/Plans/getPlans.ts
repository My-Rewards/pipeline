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
    SK: string;
    orgId?: string;
    type?: string;
    visits?: number;
    points?: number;
    active: boolean;
    updatedAt: string;
    id: string;
}

interface GroupedPlan {
    userId: string;
    orgId: string;
    loyaltyPlan?: Omit<Plan, 'type' | 'orgId'>;
    milestonePlan?: Omit<Plan, 'type' | 'orgId'>;
    organization?: any;
}


export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const plansTable = process.env.PLANS_TABLE;
    const orgTable = process.env.ORG_TABLE;
    const userTable = process.env.USER_TABLE;
    const imageDomain = process.env.IMAGE_DOMAIN;

    const userSub = event.requestContext.authorizer?.claims?.sub;

    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 20;
    const lastEvaluatedKey = event.queryStringParameters?.nextToken
        ? JSON.parse(decodeURIComponent(event.queryStringParameters.nextToken))
        : undefined;

    switch(true) {
        case (!plansTable || !orgTable || !userTable):
            return { statusCode: 500, body: JSON.stringify({ error: "Missing table environment variables" }) };
        case (!userSub):
            return { statusCode: 400, body: JSON.stringify({ error: "User ID is required" }) };
        case (!imageDomain):
            return { statusCode: 500, body: JSON.stringify({ error: "Missing image domain environment variable" }) };
    }

    try {
        const queryParams = new QueryCommand({
            TableName: plansTable,
            KeyConditionExpression: "userId = :userId",
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

            const [orgId, planType] = plan.SK.split('#');

            if (!plansMap[orgId]) {
                plansMap[orgId] = {
                    userId: plan.userId,
                    orgId
                };
            }

            const { type, orgId: _, ...planData } = plan;

            if (planType === 'LOYALTY') {
                plansMap[orgId].loyaltyPlan = planData;
            } else if (planType === 'MILESTONE') {
                plansMap[orgId].milestonePlan = planData;
            }
        });

        const enhancedPlans = await Promise.all(
            Object.values(plansMap).map(async (planGroup) => {
                if (!planGroup.organization) {
                    const getOrg = new GetCommand({
                        TableName: orgTable,
                        Key: { id: planGroup.orgId },
                        ProjectionExpression: "id, #org_name, images, rm_active, rl_active",
                        ExpressionAttributeNames: {
                            "#org_name": "name"
                        }
                    });

                    const orgResult = await dynamoDb.send(getOrg);
                    const org = orgResult.Item;

                    if (org) {
                        planGroup.organization = {
                            id: org.id,
                            name: org.name || "Unknown Organization",
                            logo: org.images.logo.url || null,
                            bannerImage:org.images.banner.url || null,
                            loyaltyActive: org.rl_active || false,
                            milestoneActive: org.rm_active || false
                        };
                    } else {
                        planGroup.organization = {
                            id: planGroup.orgId,
                            name: "Unknown Organization",
                            logo: null,
                            bannerImage: null,
                            loyaltyActive: false,
                            milestoneActive: false
                        };
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