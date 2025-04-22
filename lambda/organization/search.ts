import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

const rdsClient = new RDSDataClient({region: "us-east-1"});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const orgTable = process.env.ORG_TABLE;

    let searchQuery = event.queryStringParameters?.q?.trim() || null;

    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 10;

    if (!orgTable) {
        return { statusCode: 500, body: JSON.stringify({ error: "Missing organization table environment variable" }) };
    }

    if (!searchQuery) {
        return { statusCode: 400, body: JSON.stringify({ error: "Search query is required" }) };
    }
    
    searchQuery = searchQuery.toLowerCase();

    try {
         const auroraResult = await rdsClient.send(
              new ExecuteStatementCommand({
                secretArn: process.env.SECRET_ARN,
                resourceArn: process.env.CLUSTER_ARN,
                database: process.env.DB_NAME,
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
                LIMIT 5
                `,
                parameters: [
                    { name: 'searchQuery', value: { stringValue: searchQuery } },
                  ],
              }),  
            );

            const records = auroraResult.records || [];
            console.log("Records from Aurora:", records);

            const formattedRecords = records.map(record => {
                return {
                    id: record[0]?.stringValue,
                    organization_id: record[1]?.stringValue,
                    search_name: record[2]?.stringValue,
                };
            });
    
            if (formattedRecords.length === 0) {
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        message: "No shops found",
                        value: [],
                    }),
                };
            }

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