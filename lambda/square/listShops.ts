import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { KMSClient, DecryptCommand } from "@aws-sdk/client-kms";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { DynamoDBDocumentClient, GetCommand, GetCommandInput } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import * as square from 'square'

const kms = new KMSClient({ region: process.env.AWS_REGION });
const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

async function decryptKMS(encryptedBase64:String, kmsKey:string) {
    try {
        const encryptedBuffer = Buffer.from(encryptedBase64, "base64");

        const command = new DecryptCommand({
            CiphertextBlob: encryptedBuffer,
            KeyId: kmsKey
        });
        
        const { Plaintext } = await kms.send(command);
        const decryptedString = new TextDecoder().decode(Plaintext);
        console.log("Decrypted value:", decryptedString);
        return decryptedString;

    } catch (error) {
        console.error("KMS Decryption Error:", error);
        throw new Error("Failed to decrypt Square API token.");
    }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    if (!event.queryStringParameters || !event.queryStringParameters.owner_id) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing owner_id query parameter" }) };
    }

    const userTable = process.env.USER_TABLE;
    const appEnv = process.env.APP_ENV;
    const kmsKey = process.env.KMS_KEY_ID

    switch(true){
        case !userTable: return { statusCode: 500, body: JSON.stringify({ error: "User Table Missing" }) };
        case !appEnv: return { statusCode: 500, body: JSON.stringify({ error: "APP Env Missing" }) };
        case !kmsKey: return { statusCode: 500, body: JSON.stringify({ error: "KMS key Missing" }) };
    }

    const user_id = event.queryStringParameters.owner_id;

    try {
        const params: GetCommandInput = {
            TableName: userTable,
            Key: { id: user_id },
            ProjectionExpression: "accessToken",
        };
        const response = await dynamoDb.send(new GetCommand(params));

        const squareAccessToken = await decryptKMS(response.Item?.accessToken, kmsKey);

        const client = new square.SquareClient({
            environment: appEnv === 'prod'? square.SquareEnvironment.Production : square.SquareEnvironment.Sandbox,
            token:squareAccessToken

        });

        const shops = client.locations.list();

        return {
            statusCode: 200,
            body: JSON.stringify({ shops })
        };
    } catch (error) {
        console.error("Error fetching Square merchants:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
};
