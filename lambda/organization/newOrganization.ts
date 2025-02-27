import { SecretsManagerClient, GetSecretValueCommand} from "@aws-sdk/client-secrets-manager"
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";
import { DynamoDBDocumentClient, GetCommand, GetCommandInput, PutCommand, PutCommandInput, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import Stripe from "stripe";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { OrganizationProps } from "../Interfaces";

const secretClient = new SecretsManagerClient({ region: "us-east-1" });
const s3 = new S3Client({ region: "us-east-1" });
const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

let cachedStripeKey: string | null; 

const getStripeSecret = async (stripeArn:string): Promise<string | null> => {
    const data = await secretClient.send(new GetSecretValueCommand({ SecretId: stripeArn }));

    if (!data.SecretString) {
        throw new Error("Stripe key not found in Secrets Manager.");
    }

    const secret = JSON.parse(data.SecretString);
    return secret.secretKey;
};

const getUserEmailFromDynamoDB = async (userId: string, userTable:string): Promise<string | null> => {
    try {
        const params = new GetCommand({
            TableName: userTable,
            Key: { id: userId },
            ProjectionExpression: "email",
        });
        const response = await dynamoDb.send(params);

        if (!response || !response.Item) {
            return null;
        }

        return response.Item.email || null;
        
    } catch (error) {
        return null;
    }
};

const getPresignedUrls = async (fileKeys: string[], bucketName:string) => {
    return await Promise.all(
        fileKeys.map(async (fileKey) => {
            const command = new PutObjectCommand({
                Bucket: bucketName,
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

    const orgTable = process.env.ORG_TABLE;
    const userTable = process.env.USER_TABLE;
    const bucketName = process.env.BUCKET_NAME;
    const imageDomain = process.env.IMAGE_DOMAIN;
    const stripeArn = process.env.STRIPE_ARN;

    switch(true){
        case !orgTable || !userTable: return{statusCode:404, body:'Missing Table Info'};
        case !stripeArn: return{statusCode:404, body:'Missing Stripe ARN'};
        case !imageDomain: return{statusCode:404, body:'Missing Image Domain'};
        case !bucketName: return{statusCode:404, body:'Missing Image Bucket Name'};
    }

    try {
        const { 
            userSub, 
            org_name, 
            description, 
            rewards_loyalty, 
            rewards_milestone, 
            rl_active, 
            rm_active 
        } = JSON.parse(event.body);

        const organization_id = randomUUID();

        if (!userSub) {
            return { statusCode: 400, body: JSON.stringify({ error: "User ID is required" }) };
        }

        if(!org_name || !description || !rl_active || !rm_active){
            return { statusCode: 500, body: JSON.stringify({ error: "Body Incomplete" }) };
        }

        if (!cachedStripeKey) {
            cachedStripeKey = await getStripeSecret(stripeArn);
            if (!cachedStripeKey) return { statusCode: 404, body: JSON.stringify({ error: "Failed to retrieve Stripe secret key" }) };
        }

        const stripe = new Stripe(cachedStripeKey, { apiVersion: "2025-01-27.acacia" });

        const userEmail = await getUserEmailFromDynamoDB(userSub, userTable);

        if (!userEmail) {
            return { statusCode: 404, body: JSON.stringify({ error: "User email not found in database" }) };
        }

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

        const dynamoDbItem = new PutCommand ({
            TableName: orgTable,
            Item: <OrganizationProps> {
                id:organization_id,
                owner_id: userSub,
                stripe_id: stripeCustomer.id,
                accessToken:null,
                refreshToken:null,
                updatedAt:null,
                expiresAt:null,
                square_merchant_id: null,
                date_registered: new Date().toISOString(),
                lastUpdate: new Date().toISOString(),
                rewards_loyalty,
                rewards_milestone,
                members:[],
                name:org_name,
                description,
                rl_active,
                rm_active,
                active:false,
                images: {
                    logo: publicUrls[0],
                    preview: publicUrls[1],
                    banner: publicUrls[2],
                },
                linked:false
            },
        });
        
        await dynamoDb.send(dynamoDbItem);

        const updateUser = new UpdateCommand({
            TableName: userTable,
            Key: { id: userSub },
            UpdateExpression: 'SET orgId = :org_id',
            ExpressionAttributeValues: {
            ':org_id': organization_id,
            },
            ReturnValues: 'UPDATED_NEW'
        });
    
        await dynamoDb.send(updateUser);

        const preSignedUrls = await getPresignedUrls(fileKeys, bucketName);

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
