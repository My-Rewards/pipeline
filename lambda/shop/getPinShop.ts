import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const shopTable = process.env.SHOP_TABLE;
const orgTable = process.env.ORG_TABLE;
const secretArn = process.env.SECRET_ARN;
const resourceArn = process.env.CLUSTER_ARN;
const database = process.env.DB_NAME;

export const handler = async (event: APIGatewayProxyEvent) => {
  const userSub = event.requestContext.authorizer?.claims?.sub;

  if (!userSub) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Missing userSub" }),
    };
  }

  try {
    const query = event.queryStringParameters || {};
    const shop_id = parseFloat(query.shop_id || "");
    const distance = parseFloat(query.distance || "");
    validateEnv();

    if (!shop_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No shop_id provided" }),
      };
    }
    const shopRes = await docClient.send(
      new GetCommand({
        TableName: shopTable,
        Key: { id: shop_id },
        ProjectionExpression: "#loc, shop_hours, longitude, latitude, org_id",
        ExpressionAttributeNames: {
          "#loc": "location",
        },
      })
    );
    const shop = shopRes.Item;

    if (!shop) {
      return null;
    }
    const orgRes = await docClient.send(
      new GetCommand({
        TableName: orgTable,
        Key: { id: shop.org_id },
        ProjectionExpression: "#nam, images",
        ExpressionAttributeNames: {
          "#nam": "name",
        },
      })
    );
    const org = orgRes.Item;
    if (!org) {
      return null;
    }

    let miles = null;
    if (distance) {
      miles = distance * 0.00062137;
      miles = miles.toFixed(1);
    }
    const favorite = false;

    const result = {
      shop_id: shop_id,
      org_id: shop.ord_id,
      preview: org.images?.banner?.url || "",
      latitude: shop.latitude,
      longitude: shop.longitude,
      name: org.name,
      distance: miles,
      favorite,
      location: shop.location,
      shop_hours: shop.shop_hours,
    };
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Shop found",
        value: result,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    };
  } catch (error) {
    console.log("Error in getRadiusShops lambda", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

function validateEnv() {
  if (!shopTable || !orgTable || !secretArn || !resourceArn || !database) {
    throw new Error("Missing env values");
  }
}
