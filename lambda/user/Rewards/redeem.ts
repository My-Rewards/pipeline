import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

const rewardTable = process.env.REWARDS_TABLE;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        validateEnv();

        const {reward_id} = parseAndValidateInput(event);
        const userSub = event.requestContext.authorizer?.claims?.sub;

        if (!userSub) {
            return { statusCode: 400, body: JSON.stringify({ error: "User ID is required" }) };
        }

        const result = await updateReward(reward_id)

        return {
            statusCode: 201,
            body: JSON.stringify({ message: "Successfully redeemed reward", redeemed: true}),
        };
    } catch (error) {
        console.error("Error Redeeming Reward:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error" }),
        };
    }
};

function validateEnv() {
    if(!rewardTable) {
        throw new Error("Missing env variable")
    }
}

function parseAndValidateInput(event: APIGatewayProxyEvent): { reward_id: string } {
    const { reward_id } = event.queryStringParameters || {};
    if ( !reward_id ) {
        throw new Error(`Missing required attributes: reward_id`);
    }

    return { reward_id };
}

async function updateReward(reward_id: string) {
    const now = new Date().toISOString();

    const result = await dynamoDb.send(new UpdateCommand({
        TableName: rewardTable,
        Key: { id: reward_id },
        UpdateExpression: "SET active = :active, last_update = :last_updated",
        ExpressionAttributeValues: {
            ":active": 0,
            ":last_update": now,
        }
    }));

    if (!result.Attributes) {
        return {
            statusCode: 201,
            body: JSON.stringify({ message: "Failed to redeem reward", redeemed: false}),
        };
    }

    return result.Attributes
}

