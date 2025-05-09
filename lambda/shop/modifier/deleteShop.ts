import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {ExecuteStatementCommand, RDSDataClient } from "@aws-sdk/client-rds-data";
import {
    DynamoDBDocumentClient,
    GetCommand,
    DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {STATUS_CODE} from "@/global/statusCodes";

const client = new DynamoDBClient({});
const dynamoClient = DynamoDBDocumentClient.from(client);
const rdsClient = new RDSDataClient({});

const SHOP_TABLE = process.env.SHOP_TABLE;
const USER_TABLE = process.env.USER_TABLE;
const CLUSTER_ARN = process.env.CLUSTER_ARN;
const DB_NAME = process.env.DB_NAME;
const SECRET_ARN = process.env.SECRET_ARN;

export const handler = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    try {
        await validateEnv();

        const shopId = event.queryStringParameters?.shop_id;
        const userSub = event.requestContext.authorizer?.claims?.sub;

        if (!shopId) {
            return {
                statusCode: STATUS_CODE.MissingParam,
                body: JSON.stringify({ error: "Missing required parameter shop_id" }),
            };
        }

        await validateAction(userSub, shopId);

        const {shopName} = await deleteDynamo(shopId);

        await deleteAurora(shopId);

        return {
            statusCode: STATUS_CODE.Success,
            body: JSON.stringify({ message: `${shopName} deleted` }),
        };

    } catch (error) {
        console.error("Error deleting shop:", error);
        return errorResponse(error as Error);
    }
};

async function validateEnv(){
    if (!SHOP_TABLE || !USER_TABLE || !CLUSTER_ARN || !DB_NAME || !SECRET_ARN) {
        throw new Error(`Missing env values`);
    }
}

async function validateAction(userSub: string, shopId: string) {
    const result = await dynamoClient.send(
        new GetCommand({
            TableName: USER_TABLE,
            Key: { id: userSub },
            ProjectionExpression: "org_id",
        })
    );

    if(!result.Item?.org_id) throw new Error(`User not Linked`);

    const { Item: shop } = await dynamoClient.send(
        new GetCommand({
            TableName: SHOP_TABLE,
            Key: { id: shopId },
            ProjectionExpression: "id, org_id",
        })
    );

    if (!shop) throw new Error(`Shop not found`);

    if (shop.org_id != result.Item?.org_id) throw new Error(`Invalid Credentials`);

    return { shop_id:shopId };
}

async function deleteDynamo(shopId: string): Promise<{shopName:string|null }> {
    const result = await dynamoClient.send(
        new DeleteCommand({
            TableName: SHOP_TABLE,
            Key: { id: shopId },
            ReturnValues: "ALL_OLD",
        })
    );
    const old = result.Attributes as { name?: string } | undefined;
    return { shopName:old?.name ?? null};
}

async function deleteAurora(shopId:string){
    await rdsClient.send(
        new ExecuteStatementCommand({
            resourceArn: CLUSTER_ARN,
            secretArn: SECRET_ARN,
            database: DB_NAME,
            sql: `
                DELETE FROM Shops WHERE id = :shopId;
            `,
            parameters: [
                { name: "shopId", value: { stringValue: shopId } },
            ],
        })
    );
}

function errorResponse(error: Error): APIGatewayProxyResult {
    return {
        statusCode: 500,
        body: JSON.stringify({
            error: error.message,
        }),
    };
}