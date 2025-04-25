import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

const rdsClient = new RDSDataClient({region: "us-east-1"});

const orgTable = process.env.ORG_TABLE;
const secretArn = process.env.SECRET_ARN;
const resourceArn = process.env.CLUSTER_ARN;
const database = process.env.DB_NAME;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {

    let searchQuery = event.queryStringParameters?.q?.trim() || null;

    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 10;

    if (!searchQuery) {
        return { statusCode: 400, body: JSON.stringify({ error: "Search query is required" }) };
    }
    
    searchQuery = searchQuery.toLowerCase();

    try {
        validateEnvs();

        const auroraResult = await rdsClient.send(
              new ExecuteStatementCommand({
                secretArn: secretArn,
                resourceArn: resourceArn,
                database: database,
                sql: `
                    SELECT 
                    s.id, 
                    s.organization_id,
                    o.search_name
                    FROM shops s
                    JOIN organizations o ON o.id = s.organization_id
                    WHERE s.active = TRUE 
                    AND o.active = TRUE
                    AND o.search_name ILIKE '%' || :searchQuery || '%'
                    LIMIT :limit
                `,
                parameters: [
                    { name: 'searchQuery', value: { stringValue: searchQuery } },
                    { name: 'limit', value: { longValue: limit } },
                ],
              }),  
            );

            const records = auroraResult.records || [];

            const formattedRecords = records.map(record => {
                return {
                    shop_id: record[0]?.stringValue,
                    organization_id: record[1]?.stringValue,
                    search_name: record[2]?.stringValue,
                };
            });

        return {
            statusCode: 200,
            body: JSON.stringify(formattedRecords)
        };

    } catch (error) {
        console.error("Error searching organizations:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to search organizations" })
        };
    }
};

function validateEnvs() {
    if(!orgTable || !secretArn || !resourceArn || !database) {
        throw new Error("Missing env values");
    }
}