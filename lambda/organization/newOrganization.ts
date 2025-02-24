import { SecretsManagerClient, GetSecretValueCommand} from "@aws-sdk/client-secrets-manager"
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";
import { DynamoDBDocumentClient, GetCommand, GetCommandInput, PutCommand, PutCommandInput } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import Stripe from "stripe";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// AWS Clients
const secretClient = new SecretsManagerClient({ region: "us-east-1" });
const s3 = new S3Client({ region: "us-east-1" });
const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

const requiredEnvVars = [
    "ORG_TABLE",
    "USER_TABLE",
    "BUCKET_NAME",
    "IMAGE_DOMAIN",
    "STRIPE_ARN"
];

let cachedStripeKey: string | null; 

const getStripeSecret = async (): Promise<string | null> => {
    const data = await secretClient.send(new GetSecretValueCommand({ SecretId: process.env.STRIPE_ARN }));

    if (!data.SecretString) {
        throw new Error("Stripe key not found in Secrets Manager.");
    }

    const secret = JSON.parse(data.SecretString);
    return secret.key;
};

const getUserEmailFromDynamoDB = async (userId: string): Promise<string | null> => {
    try {
        const params: GetCommandInput = {
            TableName: process.env.USER_TABLE,
            Key: { user_id: userId },
            ProjectionExpression: "email",
        };
        const response = await dynamoDb.send(new GetCommand(params));

        if (!response || !response.Item) {
            console.error(`User not found in DynamoDB for user_id: ${userId}`);
            return null;
        }

        return response.Item.email || null;
        
    } catch (error) {
        console.error("Error fetching user email from DynamoDB:", error);
        return null;
    }
};

// Function to generate pre-signed URL
const getPresignedUrls = async (fileKeys: string[]) => {
    return await Promise.all(
        fileKeys.map(async (fileKey) => {
            const command = new PutObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: fileKey,
                ContentType: "image/jpeg",
            });

            return {
                fileKey,
                url: await getSignedUrl(s3, command, { expiresIn: 300 }),
            };
        })
    );
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Request body is required" }),
        };
    }

    requiredEnvVars.forEach((envVar) => {
        if (!process.env[envVar]) {
            throw new Error(`Missing required environment variable: ${envVar}`);
        }
    });


    try {
        const { 
            user_id, 
            org_name, 
            description, 
            rewards_loyalty, 
            rewards_milestone, 
            rl_active, 
            rm_active 
        } = JSON.parse(event.body);

        const organization_id = randomUUID();

        if (!user_id) {
            return { statusCode: 400, body: JSON.stringify({ error: "User ID is required" }) };
        }

        if (!cachedStripeKey) {
            cachedStripeKey = await getStripeSecret();
            if (!cachedStripeKey) return { statusCode: 500, body: JSON.stringify({ error: "Failed to retrieve Stripe secret key" }) };
        }

        const stripe = new Stripe(cachedStripeKey, { apiVersion: "2025-01-27.acacia" });

        // Fetch user email from DynamoDB
        const userEmail = await getUserEmailFromDynamoDB(user_id);
        if (!userEmail) {
            return { statusCode: 404, body: JSON.stringify({ error: "User email not found in database" }) };
        }

        // Create Stripe Customer
        const stripeCustomer = await stripe.customers.create({
            name: org_name,
            email: userEmail,
            description: `Organization ID: ${organization_id}`,
            metadata: { organization_id },
        });

        if(!stripeCustomer){
            throw Error('Stripe failed')
        }

        const fileKeys = [`${organization_id}/logo`, `${organization_id}/preview`, `${organization_id}/banner`];
        const publicUrls = fileKeys.map((fileKey) => `https://${process.env.IMAGE_DOMAIN}/${fileKey}`);

        const dynamoDbItem:PutCommandInput = {
            TableName: process.env.ORG_TABLE,
            Item: {
                organization_id,
                owner_id: user_id,
                stripe_id: stripeCustomer.id,
                date_registered: new Date().toISOString(),
                lastUpdate: new Date().toISOString(),
                rewards_loyalty,
                rewards_milestone,
                org_name,
                description,
                rl_active,
                rm_active,
                images: {
                    logo: publicUrls[0],
                    preview: publicUrls[1],
                    banner: publicUrls[2],
                },
            },
        };
        await dynamoDb.send(new PutCommand(dynamoDbItem));

        const preSignedUrls = await getPresignedUrls(fileKeys);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Success",
                stripe_customer_id: stripeCustomer.id,
                preSignedUrls,
            }),
        };
    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Failed", error: error instanceof Error ? error.message : error }),
        };
    }
};
