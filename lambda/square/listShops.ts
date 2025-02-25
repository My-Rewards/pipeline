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

const requiredEnvVars = [
    "APP_ENV",
    "USER_TABLE",
    "KMS_KEY_ID"
];

async function decryptKMS(encryptedBase64:String) {
    try {
        const encryptedBuffer = Buffer.from(encryptedBase64, "base64");
        const command = new DecryptCommand({ CiphertextBlob: encryptedBuffer });
        const { Plaintext } = await kms.send(command);
        const decryptedString = new TextDecoder().decode(Plaintext);

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

    requiredEnvVars.forEach((envVar) => {
        if (!process.env[envVar]) {
            throw new Error(`Missing required environment variable: ${envVar}`);
        }
    });

    const user_id = event.queryStringParameters.owner_id;

    try {
        const params: GetCommandInput = {
            TableName: process.env.USER_TABLE,
            Key: { id: user_id },
            ProjectionExpression: "accessToken",
        };
        const response = await dynamoDb.send(new GetCommand(params));

        const squareAccessToken = await decryptKMS(response.Item?.accessToken);

        const client = new square.SquareClient({
            environment: process.env.APP_ENV === 'prod'? square.SquareEnvironment.Production : square.SquareEnvironment.Sandbox,
            version:'2025-01-23',
            token:squareAccessToken

        });

        const merchants = client.merchants.list();

        if (!merchants) {
            return { statusCode: 404, body: JSON.stringify({ error: "No merchants found" }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ merchants })
        };
    } catch (error) {
        console.error("Error fetching Square merchants:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
};
