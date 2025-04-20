import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
    RDSDataClient,
    ExecuteStatementCommand,
} from "@aws-sdk/client-rds-data";

const rdsClient = new RDSDataClient({});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const secretArn = process.env.SECRET_ARN;
    const resourceArn = process.env.CLUSTER_ARN;
    const database = process.env.DB_NAME;

    if (!database || !resourceArn || !secretArn) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Missing env values" }),
        };
    }

    try {
        const { org_id, lat, lon } = event.queryStringParameters || {};


        if (!org_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Organization ID is required" })
            };
        }

        if (!lat || !lon || isNaN(parseFloat(lat)) || isNaN(parseFloat(lon))) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Valid latitude and lonitude are required" })
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
                        s.id
                    FROM shops s
                             JOIN organizations o ON o.id = s.organization_id
                    WHERE s.active = TRUE
                      AND o.active = TRUE
                      AND s.organization_id = :orgId
                    ORDER BY ST_Distance(s.location, ST_MakePoint(:lon, :lat)::geography)
                        LIMIT 1;
                `,
                parameters: [
                    { name: "lat", value: { doubleValue: latitude } },
                    { name: "lon", value: { doubleValue: longitude } },
                    { name: "orgId", value: { stringValue: org_id } },
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
        const shopId = shopRecord[0].stringValue;

        return {
            statusCode: 200,
            body: JSON.stringify({
                shop_id:shopId,
            })
        };

    } catch (error) {
        console.error("Error finding nearest shop:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: "Error finding nearest shop",
                error: String(error)
            })
        };
    }
};