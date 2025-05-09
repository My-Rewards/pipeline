import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DecryptCommand, KMSClient} from "@aws-sdk/client-kms";
import {DynamoDBDocumentClient, GetCommand, GetCommandInput, QueryCommand} from "@aws-sdk/lib-dynamodb";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import * as square from 'square'

const kms = new KMSClient({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

const userTable = process.env.USER_TABLE;
const orgTable = process.env.ORG_TABLE;
const shopsTable = process.env.SHOP_TABLE;
const appEnv = process.env.APP_ENV;
const kmsKey = process.env.KMS_KEY_ID

interface Shop extends square.Square.Location {
    available:boolean
}

async function decryptKMS(encryptedBase64:String, kmsKey:string|undefined) {
    if(!kmsKey)throw new Error("KMS Key not found");

    const encryptedBuffer = Buffer.from(encryptedBase64, "hex");
    const command = new DecryptCommand({
        CiphertextBlob: encryptedBuffer,
        KeyId: kmsKey
    });
    const { Plaintext } = await kms.send(command);
    return new TextDecoder().decode(Plaintext);
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {

    const user_id = event.requestContext.authorizer?.claims?.sub;

    try {
        await validateEnv()

        const userParams: GetCommandInput = {
            TableName: userTable,
            Key: { id: user_id },
            ProjectionExpression: "org_id"
        };

        const userResult = await dynamoDb.send(new GetCommand(userParams));
        const org_id = userResult.Item?.org_id;
        if (!org_id) {
            return { statusCode: 404, body: JSON.stringify({ error: "Organization ID not found for user" }) };
        }
        const orgParams: GetCommandInput = {
            TableName: orgTable,
            Key: { id: org_id },
            ProjectionExpression: "access_token"
        };

        const response = await dynamoDb.send(new GetCommand(orgParams));

        const squareAccessToken = await decryptKMS(response.Item?.access_token, kmsKey);

        const client = new square.SquareClient({
            environment: appEnv === 'prod'? square.SquareEnvironment.Production : square.SquareEnvironment.Sandbox,
            token:squareAccessToken
        });

        const shopsResponse:square.Square.ListLocationsResponse = await client.locations.list();

        const returnResponse = await enrichShops(shopsResponse.locations ?? []);

        return {
            statusCode: 200,
            body: JSON.stringify({
                locations: returnResponse
            })
        };
    } catch (error) {
        console.error("Error fetching Square merchants:", error);
        return { statusCode: 500, body: JSON.stringify(error)};
    }
};

async function validateEnv() {
    if (!userTable || !orgTable || !shopsTable || !appEnv || !kmsKey) {
        throw new Error("Missing environment variables");
    }
}

async function enrichShops(shops: square.Square.Location[]): Promise<Shop[]> {
    return Promise.all(
        shops.map(async (loc) => {
            const q = new QueryCommand({
                TableName: shopsTable,
                IndexName: 'SquareIndex',
                KeyConditionExpression: "square_location_id = :locId",
                ExpressionAttributeValues: {
                    ":locId": loc.id
                },
                ProjectionExpression: "id",
                Limit: 1
            });
            const result = await dynamoDb.send(q);

            return {
                ...loc,
                available: (result.Count ?? 0) == 0
            };
        })
    );
}