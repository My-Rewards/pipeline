import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { PlanProps, RLProps, RMProps } from "../../Interfaces";

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

interface reward{
  reward_id:string;
  id:string
}

interface ShopPlan {
  reward_plan: {
    rewards_loyalty: RLProps | undefined;
    rewards_milestone: RMProps | undefined;
  };
  visits: number;
  points: number;
  name:string;
  redeemableRewards: reward[];
  rl_active: boolean;
  rm_active: boolean;
  firstPlan: boolean;
  organization_id:string;
  id: string;
  active: boolean;
}

const plansTable = process.env.PLANS_TABLE;
const rewardsTable = process.env.REWARDS_TABLE;
const orgTable = process.env.ORG_TABLE;

export const handler = async (event: APIGatewayProxyEvent) => {

    const { org_id } = event.queryStringParameters || {};
    const userSub = event.requestContext.authorizer?.claims?.sub;

  try {

    validateEnv();
    validateIds(userSub, org_id);

    const orgParams = new GetCommand({
      TableName: orgTable,
      Key: {id: org_id},
      ProjectionExpression: "id, #org_name, description, images, rewards_loyalty, rewards_milestone, rl_active, rm_active, date_registered, active",
      ExpressionAttributeNames: {
        "#org_name": "name"
      }
    });

    const orgResult = await dynamoDb.send(orgParams);
    const org = orgResult.Item;

    if(!org){
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Organization not found" }),
      };
    }

    const planParam = new GetCommand({
      TableName: plansTable,
      Key: {
        user_id: userSub,
        org_id: org_id
      }
    });

    const planResult = await dynamoDb.send(planParam);

    const activePlan = !!(planResult.Item);

    const redeemableRewards:reward[] = planResult.Item ? await getActiveRewards(planResult.Item.plan_id, org.rl_active, org.rm_active) : [];

    const shopPlan:ShopPlan = {
      reward_plan: {
        rewards_loyalty: org.rl_active ? org.rewards_loyalty : undefined,
        rewards_milestone: org.rm_active ? org.rewards_milestone : undefined
      },
      visits: planResult.Item?.visits || 0,
      points: planResult.Item?.points || 0,
      redeemableRewards,
      rl_active: org.rl_active || false,
      rm_active: org.rm_active || false,
      firstPlan: false,
      id: planResult.Item?.id,
      active: activePlan,
      organization_id: org.id,
      name: org.name
    };

    return {
      statusCode: 200,
      body: JSON.stringify(shopPlan)
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Could not retrieve shop plan" })
    };
  }
};

function validateEnv() {
  if (!plansTable || !rewardsTable || !orgTable) {
    throw new Error("Missing ENV variable");
  }
}

function validateIds(userSub:string|undefined, org_id:string | undefined) {
  switch (true) {
    case !userSub:
      throw new Error("Missing userSub");
      case !org_id:
        throw new Error("Missing [org_id] parameter");
  }
}

async function getActiveRewards(plan_id:string, rl_active:boolean, rm_active:boolean) {
  let filterExpression = "";
  const expressionAttributeValues: Record<string, any> = {
    ":planId": plan_id,
    ":isActive": 1,
  };

  if (rl_active && !rm_active) {
    filterExpression += " AND category = :loyalty";
    expressionAttributeValues[":loyalty"] = { S: "loyalty" };
  } else if (rm_active && !rl_active) {
    filterExpression += " AND category = :milestone";
    expressionAttributeValues[":milestone"] = { S: "milestone" };
  }

  const rewardsParams = new QueryCommand({
    TableName: rewardsTable,
    IndexName: "activeRewardsIndex",
    KeyConditionExpression: "plan_id = :planId AND active = :isActive",
    FilterExpression: filterExpression,
    ExpressionAttributeValues: expressionAttributeValues,
  });

  const result = await client.send(rewardsParams);

  return (result?.Items?.map(item => ({id:item.id, reward_id:item.reward_id})) as reward[]) || []
}