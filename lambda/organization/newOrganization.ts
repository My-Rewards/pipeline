import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import Stripe from "stripe";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { OrganizationProps } from "../Interfaces";
import { getStripeSecret } from "../constants/validOrganization";
import { STRIPE_API_VERSION } from "../../global/constants";
import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

const s3 = new S3Client({ region: "us-east-1" });
const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const rdsClient = new RDSDataClient({ region: "us-east-1" });

let cachedStripeKey: string | null;
let stripe: Stripe| null;

const getUserEmailFromDynamoDB = async (userId: string, userTable:string): Promise<string | null> => {
    try {
        const params = new GetCommand({
            TableName: userTable,
            Key: { id: userId },
            ProjectionExpression: "email, org_id",
        });

        const response = await dynamoDb.send(params);

        if (!response || !response.Item || response.Item.org_id) {
            return null;
        }

        return response.Item.email;

    } catch (error) {
        return null;
    }
};

const getPresignedUrls = async (fileKeys: string[], bucketName:string, types:string[]) => {
    return await Promise.all(
        fileKeys.map(async (fileKey, index) => {
            const command = new PutObjectCommand({
                Bucket: bucketName,
                Key: fileKey,
                ContentType: "image/jpeg",
            });
            return {
                fileKey,
                url: await getSignedUrl(s3, command, { expiresIn: 60 }),
                type:types[index]
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
    const clusterSecretArn = process.env.CLUSTER_SECRET_ARN
    const clusterArn = process.env.CLUSTER_ARN
    const dbName = process.env.DB_NAME

    switch(true){
        case !orgTable || !userTable: return{statusCode:404, body:'Missing Table Info ENV'};
        case !stripeArn: return{statusCode:404, body:'Missing Stripe ARN ENV'};
        case !imageDomain: return{statusCode:404, body:'Missing Image Domain ENV'};
        case !bucketName: return{statusCode:404, body:'Missing Image Bucket Name ENV'};
        case !clusterSecretArn: return{statusCode:404, body:'Missing Aurora Secret ARN ENV'};
        case !clusterArn: return{statusCode:404, body:'Missing Aurora ARN ENV'};
        case !dbName: return{statusCode:404, body:'Missing DB Name ENV'};
    }

    try {
        const {
            org_name,
            description,
            rewards_loyalty,
            rewards_milestone,
            rl_active,
            rm_active,
            businessTags
        } = JSON.parse(event.body);

        const userSub = event.requestContext.authorizer?.claims?.sub;

        const organization_id = randomUUID();

        if (!userSub) {
            return { statusCode: 400, body: JSON.stringify({ error: "User ID is required" }) };
        }

        if(!org_name || !description){
            return { statusCode: 500, body: JSON.stringify({ error: "Body Incomplete" }) };
        }

        if (!cachedStripeKey) {
            cachedStripeKey = await getStripeSecret(stripeArn);
            if (!cachedStripeKey) return { statusCode: 500, body: JSON.stringify({ error: "Failed to retrieve Stripe secret key" }) };
        }

        if(!stripe){
            stripe = new Stripe(cachedStripeKey, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });
            if (!stripe) return { statusCode: 500, body: JSON.stringify({ error: "Failed to open stripe Client" }) };
        }

        const userEmail = await getUserEmailFromDynamoDB(userSub, userTable);

        if (!userEmail) {
            return { statusCode: 500, body: JSON.stringify({ error: "User email not found in database or User already linked to Organization" }) };
        }

        const stripeCustomer = await stripe.customers.create({
            name: org_name,
            email: userEmail,
            description: `Organization ID: ${organization_id}`,
            metadata: { organization_id },
        });

        if(!stripeCustomer){
            return { statusCode: 500, body: JSON.stringify({ error: "Stripe Failed to create Customer" }) };
        }

        const fileKeys = [`${organization_id}/logo`, `${organization_id}/preview`, `${organization_id}/banner`];
        const types = [`logo`, `preview`, `banner`];
        const publicUrls = fileKeys.map((fileKey) => `https://${process.env.IMAGE_DOMAIN}/${fileKey}`);
        const dateNow = new Date();

        const dynamoDbItem = new PutCommand ({
            TableName: orgTable,
            Item: <OrganizationProps> {
                id:organization_id,
                stripe_id: stripeCustomer.id,
                access_token:null,
                refresh_token:null,
                updated_at:dateNow.toISOString(),
                expiresAt:null,
                square_merchant_id: null,
                owner_id:userSub,
                tags:businessTags,
                date_registered: dateNow.toISOString(),
                rewards_loyalty,
                rewards_milestone,
                name:org_name,
                search_name:org_name.toLowerCase(),
                description,
                rl_active,
                rm_active,
                active:false,
                images: {
                    logo:{
                        url:publicUrls[0],
                        fileKey: fileKeys[0]
                    },
                    preview: {
                        url:publicUrls[1],
                        fileKey: fileKeys[1]
                    },
                    banner:{
                        url:publicUrls[2],
                        fileKey: fileKeys[2]
                    },
                },
                linked:false
            },
        });


        const updateUser = new UpdateCommand({
            TableName: userTable,
            Key: { id: userSub },
            UpdateExpression: 'SET org_id = :org_id',
            ExpressionAttributeValues: {
            ':org_id': organization_id,
            },
            ReturnValues: 'UPDATED_NEW'
        });

        const preSignedUrls = await getPresignedUrls(fileKeys, bucketName, types);

        const auroraResult = await rdsClient.send(
            new ExecuteStatementCommand({
                secretArn: clusterSecretArn,
                resourceArn: clusterArn,
                database: dbName,
                sql:`
                    INSERT INTO Organizations (id, active, updated_at) 
                    VALUES (:org_id, :active, :updated_at),
                `,
                parameters: [
                    { name: "org_id", value: { stringValue: organization_id } },
                    { name: "active", value: { booleanValue: false } },
                    { name: "updated_at", value: { stringValue: dateNow.toISOString() } },
                    {name: "search_name", value: {stringValue: org_name.toLowerCase()}},
                ],
            })
        );

        if(auroraResult.numberOfRecordsUpdated == 0){
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: "Failed to Create Organization",
                    db:'Aurora'
                }),
            };
        }

        const result = await dynamoDb.send(dynamoDbItem);
        await dynamoDb.send(updateUser);

        if(!result){
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: "Failed to Create Organization",
                    db:'Dynamo'
                }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Success",
                preSignedUrls,
            }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Failed", error: error instanceof Error ? error.message : error }),
        };
    }
};
