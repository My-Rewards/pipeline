import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DecryptCommand, KMSClient} from "@aws-sdk/client-kms";
import {DynamoDBDocumentClient, GetCommand, GetCommandInput} from "@aws-sdk/lib-dynamodb";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import * as square from 'square'

const kms = new KMSClient({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

async function decryptKMS(encryptedBase64:String, kmsKey:string) {
    try {
        const encryptedBuffer = Buffer.from(encryptedBase64, "hex");
        const command = new DecryptCommand({
            CiphertextBlob: encryptedBuffer,
            KeyId: kmsKey
        });
        const { Plaintext } = await kms.send(command);
        return new TextDecoder().decode(Plaintext);

    } catch (error) {
        console.error("KMS Decryption Error:", error);
        throw new Error("Failed to decrypt Square API token.");
    }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {

    const userTable = process.env.USER_TABLE;
    const orgTable = process.env.ORG_TABLE;
    const appEnv = process.env.APP_ENV;
    const kmsKey = process.env.KMS_KEY_ID

    switch(true){
        case !userTable: return { statusCode: 500, body: JSON.stringify({ error: "User Table Missing" }) };
        case !orgTable: return { statusCode: 500, body: JSON.stringify({ error: "Organization Table Missing" }) };
        case !appEnv: return { statusCode: 500, body: JSON.stringify({ error: "APP Env Missing" }) };
        case !kmsKey: return { statusCode: 500, body: JSON.stringify({ error: "KMS key Missing" }) };
    }

    const user_id = event.requestContext.authorizer?.claims?.sub;
    try {

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
        const shops = client.locations.list();
        const shopsResponse = await client.locations.list();
        console.log("Shops response from Square:", shopsResponse);
        return {
            statusCode: 200,
            body: JSON.stringify({
                shops: shopsResponse.locations,
                rawResponse: shopsResponse
            })
        };
    } catch (error) {
        console.error("Error fetching Square merchants:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
};