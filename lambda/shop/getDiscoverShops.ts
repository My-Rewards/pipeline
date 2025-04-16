import { APIGatewayProxyEvent } from "aws-lambda";
import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const rdsClient = new RDSDataClient({});
const lambdaClient = new LambdaClient({});

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    const query = event.queryStringParameters || {};
    const latitude = parseFloat(query.lat || "");
    const longitude = parseFloat(query.lon || "");
    const page = parseInt(query.page || "1");
    const limit = parseInt(query.limit || "4");
    const offset = (page - 1) * limit;


    if (isNaN(latitude) || isNaN(longitude)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing or invalid lat/lon values" }),
      };
    }

    // STEP 1: Get nearest active shop IDs from Aurora
    const auroraResult = await rdsClient.send(
      new ExecuteStatementCommand({
        secretArn: process.env.SECRET_ARN,
        resourceArn: process.env.CLUSTER_ARN,
        database: process.env.DB_NAME,
        sql: `
          SELECT id, ST_Distance(location, ST_MakePoint(:lon, :lat)::geography) AS distance
          FROM shops
          WHERE active = TRUE
          ORDER BY location <-> ST_MakePoint(:lon, :lat)::geography
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
        body: JSON.stringify([]),
      };
    }

    // STEP 2: Extract shop IDs and invoke getShop Lambda for each
    const shopIds = records.map((row) => row[0].stringValue);

    const shopDetails = await Promise.all(
      shopIds.map(async (shop_id) => {
        const getShopResponse = await lambdaClient.send(
          new InvokeCommand({
            FunctionName: process.env.GET_SHOP_LAMBDA_NAME!,
            Payload: Buffer.from(JSON.stringify({
              queryStringParameters: { shop_id },
            })),
          })
        );

        if (getShopResponse.Payload) {
          const result = JSON.parse(Buffer.from(getShopResponse.Payload).toString());
          if (result.statusCode === 200) {
            return JSON.parse(result.body);
          }
        }

        return null;
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify(shopDetails.filter(Boolean)),
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
