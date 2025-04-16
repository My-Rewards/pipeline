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
        const queryParams: QueryCommandInput = {
            TableName: plansTable,
            IndexName: "userId-index",
            KeyConditionExpression: "userId = :userId",
            FilterExpression: "active = :activeStatus",
            ExpressionAttributeValues: {
                ":userId": userSub,
                ":activeStatus": true
            },
            Limit: limit,
            ScanIndexForward: false,
            ProjectionExpression: "visits, points, active, updatedAt, orgId, id",
            ExclusiveStartKey: lastEvaluatedKey
        };


        const plansResult = await dynamoDb.send(new QueryCommand(queryParams));

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

        const enhancedPlans = await Promise.all(plansResult.Items.map(async (plan) => {
            const getOrg = new GetCommand({
                TableName: orgTable,
                Key: { id: plan.orgId },
                ProjectionExpression: "images, name, rm_active, rl_active, rewards_loyalty, rewards_milestone"
            });

            const orgResult = await dynamoDb.send(getOrg);
            const org = orgResult.Item;

            let logoUrl = null;
            let previewImageUrl = null;

            if (org && org.logo) {
                logoUrl = `https://${imageDomain}/${org.logo}`;
            }

            if (org && org.preview_image) {
                previewImageUrl = `https://${imageDomain}/${org.preview_image}`;
            }

            return {
                ...plan,
                organization: {
                    id: org?.id || plan.orgId,
                    name: org?.org_name || "Unknown Organization",
                    logo: logoUrl,
                    previewImage: previewImageUrl
                }
            };
        }));

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