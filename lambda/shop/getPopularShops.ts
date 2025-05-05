import {APIGatewayProxyEvent} from "aws-lambda";
import {ExecuteStatementCommand, Field, RDSDataClient,} from "@aws-sdk/client-rds-data";
import {DynamoDBDocumentClient, GetCommand} from "@aws-sdk/lib-dynamodb";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";

const rdsClient = new RDSDataClient({region: "us-east-1"});
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const shopTable = process.env.SHOP_TABLE;
const orgTable = process.env.ORG_TABLE;
const secretArn = process.env.SECRET_ARN;
const resourceArn = process.env.CLUSTER_ARN;
const database = process.env.DB_NAME;

export const handler = async (event: APIGatewayProxyEvent) => {
  const userSub = event.requestContext.authorizer?.claims?.sub;

  try {
    const query = event.queryStringParameters || {};
    const latitude = parseFloat(query.lat || "");
    const longitude = parseFloat(query.lon || "");
    const page = parseInt(query.page || "1");
    const limit = 10;
    const offset = (page - 1) * limit;

    validateEnv();

    if (isNaN(latitude) || isNaN(longitude) || isNaN(limit) || isNaN(offset)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid query parameters" }),
      };
    }

    const records = await auroraCall(latitude, longitude, limit, offset, userSub);

    const enrichedShops = await enrichList(records);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Shops found",
        value: enrichedShops.filter(Boolean),
        pagination: {
          currentPage: page,
          limit,
          hasMore: enrichedShops.length === limit,
          nextPage: enrichedShops.length === limit ? page + 1 : null
        }
      }),
      headers: {
        "Content-Type": "application/json",
      },
    };

  } catch (err) {
    console.error("Error in getPopularShops Lambda:", err);
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

async function auroraCall(latitude: number, longitude: number, limit: number, offset: number, userSub: string) {

  const auroraRawData = await rdsClient.send(
      new ExecuteStatementCommand({
        secretArn: secretArn,
        resourceArn: resourceArn,
        database: database,
        sql: `
        SELECT
        s.id,
        s.organization_id,
        ST_Distance(s.location, ST_MakePoint(:lon, :lat)::geography) AS distance,
        CASE
            WHEN ul.user_id IS NOT NULL THEN TRUE
            ELSE FALSE
        END AS favorite
        FROM shops s
        JOIN organizations o
        ON o.id = s.organization_id
        AND o.active = TRUE
        LEFT JOIN (
        SELECT organization_id, COUNT(*) AS like_count
        FROM OrgLikes
        GROUP BY organization_id
        ) AS like_counts
        ON like_counts.organization_id = s.organization_id
        LEFT JOIN OrgLikes ul
        ON ul.organization_id = s.organization_id
        AND ul.user_id = :userId
        WHERE s.active = TRUE
        ORDER BY like_counts.like_count DESC NULLS LAST
        LIMIT :limit
        OFFSET :offset;
        `,
        parameters: [
          {name: "lat", value: {doubleValue: latitude}},
          {name: "lon", value: {doubleValue: longitude}},
          {name: "userId", value: {stringValue: userSub}},
          {name: "limit", value: {longValue: limit}},
          {name: "offset", value: {longValue: offset}},
        ],
      })
  );

  return auroraRawData.records || [];

}

async function enrichList(records:Field[][]){
  return await Promise.all(
      records.map(async (row) => {
        const shop_id= row[0].stringValue;
        const org_id = row[1].stringValue;
        const distance= row[2].doubleValue;
        const favorite = row[3].booleanValue;

        try {
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
          if (!shop) return null;

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
          if (!org){
            return null;
          }

          let miles = null;
          if (distance) {
            miles = distance* 0.00062137;
            miles = miles.toFixed(1);
          }

          return {
            shop_id: shop_id,
            org_id: org_id,
            preview: org.images?.preview?.url || "",
            name: org.name,
            distance: miles,
            favorite: favorite,
            location: shop.location,
            shop_hours: shop.shop_hours,
          };
        } catch (err) {
          console.error(
              `Failed to fetch shop/org/like for shop_id: ${shop_id}`,
              err
          );
          return null;
        }
      })
  );

}