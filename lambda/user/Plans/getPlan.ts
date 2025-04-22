import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { PlanProps, RLProps, RMProps } from "../../Interfaces";

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

interface ShopPlan {
  reward_plan: {
    rewards_loyalty: RLProps | undefined;
    rewards_milestone: RMProps | undefined;
  };
  visits: number;
  points: number;
  redeemableRewards: string[];
  rl_active: boolean;
  rm_active: boolean;
  firstPlan: boolean;
  activePlan: boolean;
  id: string;
  favorite: boolean;
  active: boolean;
}

export const handler = async (event: APIGatewayProxyEvent) => {
    const plansTable = process.env.PLANS_TABLE;
    const orgTable = process.env.ORG_TABLE;

    const { org_id } = event.queryStringParameters || {};
    const userSub = event.requestContext.authorizer?.claims?.sub;

    switch (true) {
      case (!plansTable || !orgTable):
        return { statusCode: 500, body: JSON.stringify({ error: "Missing env values" }) };
      case !userSub:
        return { statusCode: 404, body: JSON.stringify({ error: "Missing userSub" }) };
      case !org_id:
        return { statusCode: 404, body: JSON.stringify({ error: "Missing [org_id] parameter" }) };
    }

  try {

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

    let activePlan = false;

    if(planResult.Item){
      activePlan=true;
    }

    const shopPlan = {
      reward_plan: {
        rewards_loyalty: org.rl_active ? org.rewards_loyalty : undefined,
        rewards_milestone: org.rm_active ? org.rewards_milestone : undefined
      },
      visits: planResult.Item?.visits || 0,
      points: planResult.Item?.points || 0,
      redeemableRewards: [],
      rl_active: org.rl_active || false,
      rm_active: org.rm_active || false,
      firstPlan: false,
      id:planResult.Item?.id,
      active:activePlan,
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