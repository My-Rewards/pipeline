import {
    APIGatewayProxyEvent,
    APIGatewayProxyResult
} from "aws-lambda";
import {
    RDSDataClient,
    ExecuteStatementCommand
} from "@aws-sdk/client-rds-data";

const rds = new RDSDataClient({});

const secretArn = process.env.CLUSTER_SECRET_ARN;
const resourceArn = process.env.CLUSTER_ARN;
const database = process.env.DB_NAME;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const userId = event.requestContext.authorizer?.claims?.sub;
        const { org_id } = event.queryStringParameters || {};

        if (!org_id) throw new Error("Missing org_id");
        if (!userId) throw new Error("Missing user_id");

        checkEnv();

        const liked = await auroraCall(userId, org_id);

        return {
            statusCode: 200,
            body: JSON.stringify({
                sucess:true,
                liked
            })
        };
    } catch (err) {
        console.error("Error toggling like:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal error" })
        };
    }
};

function checkEnv() {
    if(!secretArn || !resourceArn || !database) throw new Error(
        "Missing env values"
    )
}

async function auroraCall(userId: string, orgId: string) {
    const result = await rds.send(new ExecuteStatementCommand({
        resourceArn: resourceArn,
        secretArn:   secretArn,
        database:    database,
        sql: `
                WITH deleted AS (
                  DELETE FROM OrgLikes
                   WHERE user_id = :userId
                     AND organization_id = :orgId
                  RETURNING *
                ), inserted AS (
                  INSERT INTO OrgLikes (user_id, organization_id, liked_at)
                  SELECT :userId, :orgId, NOW()
                   WHERE NOT EXISTS (SELECT 1 FROM deleted)
                  RETURNING *
                )
                SELECT CASE
                  WHEN (SELECT COUNT(*) FROM deleted) > 0 THEN FALSE
                  WHEN (SELECT COUNT(*) FROM inserted) > 0 THEN TRUE
                  ELSE FALSE
                END AS liked;
              `,
        parameters: [
            { name: "userId", value: { stringValue: userId } },
            { name: "orgId", value: { stringValue: orgId  } }
        ]
    }));

    return result.records?.[0]?.[0]?.booleanValue ?? false;
}