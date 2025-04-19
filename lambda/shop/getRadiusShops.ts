import { ApiGateway } from "aws-cdk-lib/aws-events-targets";
import {
  RDSDataClient,
  ExecuteStatementCommand,
} from "@aws-sdk/client-rds-data";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";

const rdsClient = new RDSDataClient({});
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: APIGatewayProxyEvent) => {
  const shopTable = process.env.SHOP_TABLE;
  const orgTable = process.env.ORG_TABLE;
  const likesTable = process.env.LIKES_TABLE;
  const userSub = event.requestContext.authorizer?.claims?.sub;

  if (!shopTable || !orgTable || !likesTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing env values" }),
    };
  }

  if (!userSub) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Missing userSub" }),
    };
  }

  try {
    const query = event.queryStringParameters || {};
    const latitude = parseFloat(query.lat || "");
    const longitude = parseFloat(query.lon || "");

    if (isNaN(latitude) || isNaN(longitude)) {
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
  WHERE s.active = TRUE 
    AND o.active = TRUE
    AND ST_Distance(s.location, ST_MakePoint(:lon, :lat)::geography) <= 80467
  ORDER BY distance;
`,
      })
    );

    const records = auroraResult.records || [];
    if (records.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No shops found", value: [] }),
      };
    }

    const shopDetails = records.map((row) => ({
      shop_id: row[0].stringValue,
      org_id: row[1].stringValue,
      distance: row[2].doubleValue,
    }));

    const allShops = await Promise.all(
      shopDetails.map(async (shopDetails) => {
        try {
          const shopRes = await docClient.send(
            new GetCommand({
              TableName: shopTable,
              Key: { id: shopDetails.shop_id },
              ProjectionExpression: "#loc, shop_hours",
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
              Key: { id: shopDetails.org_id },
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
          if (shopDetails.distance) {
            miles = shopDetails.distance * 0.00062137;
            miles = miles.toFixed(1);
          }
          const favorite = false;

          return {
            id: shopDetails.shop_id?.toString().slice(0, 4),
            shop_id: shopDetails.shop_id,
            organization_id: shopDetails.org_id,
            preview: org.images?.banner?.url || "",
            name: org.name,
            distance: miles,
            favorite,
            location: shop.location,
            shop_hours: shop.shop_hours,
          };
        } catch (error) {
          console.log(
            `Failed to fetch shop/org/like for shop_id: ${shopDetails.shop_id}`,
            error
          );
          return null;
        }
      })
    );

    console.log("Aurora Result:", auroraResult);
    console.log("Shop Details:", shopDetails);
    console.log("All Shops:", allShops);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Shops found",
        value: allShops.filter(Boolean),
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

  return {
    statusCode: 500,
    body: JSON.stringify({ error: "Unhandled code path" }),
  };
};
