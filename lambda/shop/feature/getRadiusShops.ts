import {
  ExecuteStatementCommand,
  RDSDataClient,
} from "@aws-sdk/client-rds-data";
import { APIGatewayProxyEvent } from "aws-lambda";
import {STATUS_CODE} from "../../../global/statusCodes";

const rdsClient = new RDSDataClient({});
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
    const shops = records.map((row) => {
      const shop = {
        id: row[0].stringValue,
        longitude: row[1].doubleValue,
        latitude: row[2].doubleValue,
      };
      return shop;
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Shops found",
        value: shops,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    };
  } catch (error) {
    console.log("Error in getRadiusShops lambda", error);
    return {
      statusCode: STATUS_CODE.Error,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

function validateEnv() {
  if (!secretArn || !resourceArn || !database) {
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
        ST_X(s.location::geometry) AS longitude,
        ST_Y(s.location::geometry) AS latitude
        FROM shops s
        JOIN organizations o ON o.id = s.organization_id
        WHERE s.active = TRUE 
        AND o.active = TRUE
        AND ST_Distance(s.location, ST_MakePoint(:lon, :lat)::geography) <= 321869
        `,
      parameters: [
        { name: "lat", value: { doubleValue: latitude } },
        { name: "lon", value: { doubleValue: longitude } },
      ],
    })
  );

  return auroraResult.records || [];
}
