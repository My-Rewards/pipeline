import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  RDSDataClient,
  ExecuteStatementCommand,
} from "@aws-sdk/client-rds-data";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const rdsClient = new RDSDataClient({});
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const shopTable = process.env.SHOP_TABLE;
  const orgTable = process.env.ORG_TABLE;
  const secretArn = process.env.SECRET_ARN;
  const resourceArn = process.env.CLUSTER_ARN;
  const database = process.env.DB_NAME;

  if (!database || !resourceArn || !secretArn || !shopTable || !orgTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing env values" }),
    };
  }

  try {
    const { shop_id, lat, lon } = event.queryStringParameters || {};

    if (!shop_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Shop ID is required" }),
      };
    }

    if (!lat || !lon || isNaN(parseFloat(lat)) || isNaN(parseFloat(lon))) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Valid latitude and lonitude are required",
        }),
      };
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    const auroraResult = await rdsClient.send(
      new ExecuteStatementCommand({
        secretArn: secretArn,
        resourceArn: resourceArn,
        database: database,
        sql: `
                    SELECT 
                    s.id, 
                    s.organization_id, 
                    ST_Distance(s.location, ST_MakePoint(:lon, :lat)::geography) AS distance
                    FROM shops s
                    JOIN organizations o ON o.id = s.organization_id
                    WHERE s.active = TRUE AND o.active = TRUE
                    ORDER BY s.location <-> ST_MakePoint(:lon, :lat)::geography
                    LIMIT 1
                `,
        parameters: [
          { name: "lat", value: { doubleValue: latitude } },
          { name: "lon", value: { doubleValue: longitude } },
        ],
      })
    );

    const records = auroraResult.records || [];
    if (records.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No shops found", value: [] }),
      };
    }

    const shopRecord = records[0];
    const org_id = shopRecord[1].stringValue;
    const distance = shopRecord[2].doubleValue;

    const shopRes = await docClient.send(
      new GetCommand({
        TableName: shopTable,
        Key: { id: shop_id },
        ProjectionExpression: "#loc, shop_hours",
        ExpressionAttributeNames: {
          "#loc": "location",
        },
      })
    );

    const shop = shopRes.Item;
    if (!shop || !shop.shop_hours || !shop.location) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Shop not found or missing data" }),
      };
    }

    const orgRes = await docClient.send(
      new GetCommand({
        TableName: orgTable,
        Key: { id: org_id },
        ProjectionExpression: "#nam, images",
        ExpressionAttributeNames: {
          "#nam": "name",
        },
      })
    );
    console.log("Org hours and images: ", orgRes.Item);
    const org = orgRes.Item;
    if (!org) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Shop not found or missing data" }),
      };
    }

    let miles = null;
    if (distance) {
      miles = distance * 0.00062137;
      miles = miles.toFixed(1);
    }
    const favorite = false;

    const nearestShop = {
      id: shop_id,
      shop_id: shop_id,
      organization_id: org_id,
      preview: org.images?.preview?.url || "",
      name: org.name,
      distance: miles,
      favorite,
      location: shop.location,
      shop_hours: shop.shop_hours,
    };
    return {
      statusCode: 200,
      body: JSON.stringify({ nearestShop}),
      headers: {
        "Content-Type": "application/json",
      },
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to fetch nearest shop",
        details: err,
      }),
    };
  }
};
