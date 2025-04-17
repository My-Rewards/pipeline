import { APIGatewayProxyEvent } from "aws-lambda";
import {
  RDSDataClient,
  ExecuteStatementCommand,
} from "@aws-sdk/client-rds-data";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const rdsClient = new RDSDataClient({});
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: APIGatewayProxyEvent) => {
  const shopTable = process.env.SHOP_TABLE;
  const orgTable = process.env.ORG_TABLE;
  const likesTable = process.env.LIKES_TABLE;
  const userSub = event.requestContext.authorizer?.claims?.sub;

  switch (true) {
    case !shopTable || !orgTable || !likesTable:
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing env values" }),
      };
    case !userSub:
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Missing userSub" }),
      };
  }

  try {
    const query = event.queryStringParameters || {};
    const latitude = parseFloat(query.lat || "");
    const longitude = parseFloat(query.lon || "");
    const page = parseInt(query.page || "1");
    const limit = parseInt(query.limit || "4");
    const offset = (page - 1) * limit;

    if (isNaN(latitude) || isNaN(longitude) || isNaN(limit) || isNaN(offset)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid query parameters" }),
      };
    }
    const auroraResult = await rdsClient.send(
      new ExecuteStatementCommand({
        secretArn: process.env.SECRET_ARN,
        resourceArn: process.env.CLUSTER_ARN,
        database: process.env.DB_NAME,
        sql: `
          SELECT 
            s.id, 
            s.organization_id, 
            ST_Distance(s.location, ST_MakePoint(:lon, :lat)::geography) AS distance
          FROM shops s
          JOIN organizations o ON o.id = s.organization_id
          WHERE s.active = TRUE AND o.active = TRUE
          ORDER BY s.location <-> ST_MakePoint(:lon, :lat)::geography
          LIMIT :limit OFFSET :offset;
        `,
        parameters: [
          { name: "lon", value: { doubleValue: longitude } },
          { name: "lat", value: { doubleValue: latitude } },
          { name: "limit", value: { longValue: limit } },
          { name: "offset", value: { longValue: offset } },
        ],
      })
    );

    const records = auroraResult.records || [];
    if (records.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "No shops found",
          value: [],
        }),
      };
    }
    const shopsWithDistance = records.map((row) => ({
      shop_id: row[0].stringValue,
      distance: row[2].doubleValue,
    }));

    const enrichedShops = await Promise.all(
      shopsWithDistance.map(async (shopsWithDistance) => {
        try {
          const shopRes = await docClient.send(
            new GetCommand({
              TableName: shopTable,
              Key: { id: shopsWithDistance.shop_id },
              ProjectionExpression: "id, orgId, location, shop_hours",
            })
          );
          const shop = shopRes.Item;
          if (!shop || !shop.orgId) return null;

          const orgRes = await docClient.send(
            new GetCommand({
              TableName: orgTable,
              Key: { id: shop.orgId },
              ProjectionExpression: "id, name, images",
            })
          );
          const org = orgRes.Item;
          if (!org || !org.id) return null;

          const likeRes = await docClient.send(
            new GetCommand({
              TableName: likesTable,
              Key: {
                PK: `USER#${userSub}`,
                SK: `SHOP#${shop.id}`,
              },
            })
          );
          const favorite = likeRes.Item ? likeRes.Item.favorite : false;

          return {
            name: org.name,
            banner: org.images?.banner?.url || "",
            logo: org.images?.logo?.url || "",
            shop_id: shop.id,
            location: shop.location,
            shop_hours: shop.shop_hours,
            favorite,
            distance: shopsWithDistance.distance,
          };
        } catch (err) {
          console.error(
            `Failed to fetch shop/org/like for shop_id: ${shopsWithDistance.shop_id}`,
            err
          );
          return null;
        }
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Shops found",
        value: enrichedShops.filter(Boolean),
      }),
      headers: {
        "Content-Type": "application/json",
      },
    };
  } catch (err) {
    console.error("Error in discoverShops Lambda:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
