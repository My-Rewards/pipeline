import {ExecuteStatementCommand, RDSDataClient,} from "@aws-sdk/client-rds-data";
import {DynamoDBDocumentClient, GetCommand} from "@aws-sdk/lib-dynamodb";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {APIGatewayProxyEvent} from "aws-lambda";

const rdsClient = new RDSDataClient({});
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
    const latitude = parseFloat(query.lat || "");
    const longitude = parseFloat(query.lon || "");

    validateEnv();

    if (isNaN(latitude) || isNaN(longitude)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid query parameters" }),
      };
    }

    const records = await auroraCall(latitude, longitude);

    const allShops = await Promise.all(
        records.map(async (row) => {

        const shop_id= row[0].stringValue;
        const org_id= row[1].stringValue;
        const distance= row[2].doubleValue;

        try {
          const shopRes = await docClient.send(
            new GetCommand({
              TableName: shopTable,
              Key: { id: shop_id },
              ProjectionExpression: "#loc, shop_hours, longitude, latitude",
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
              Key: { id: org_id },
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

          return {
            shop_id: shop_id,
            organization_id: org_id,
            preview: org.images?.banner?.url || "",
            latitude: shop.latitude,
            longitude: shop.longitude,
            name: org.name,
            distance: miles,
            favorite,
            location: shop.location,
            shop_hours: shop.shop_hours,
          };
        } catch (error) {
          console.log(
            `Failed to fetch shop/org/like for shop_id: ${shop_id}`,
            error
          );
          return null;
        }
      })
    );

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
};

function validateEnv() {
  if (!shopTable || !orgTable || !secretArn || !resourceArn || !database) {
    throw new Error("Missing env values");
  }
}

async function auroraCall(latitude: number, longitude: number) {
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
          WHERE s.active = TRUE 
            AND o.active = TRUE
            AND ST_Distance(s.location, ST_MakePoint(:lon, :lat)::geography) <= 80467
          ORDER BY distance;
        `,
        parameters: [
          { name: "lat", value: { doubleValue: latitude } },
          { name: "lon", value: { doubleValue: longitude } },
        ],
      })
  );

  return auroraResult.records || []
}