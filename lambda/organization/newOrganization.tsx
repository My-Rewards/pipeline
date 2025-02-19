import * as AWS from "aws-sdk";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";
import { DynamoDBDocumentClient, PutCommand, PutCommandInput } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const s3 = new AWS.S3();
const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

exports.handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const TABLE_NAME = process.env.TABLE_NAME || "";
    const BUCKET_NAME = process.env.BUCKET_NAME || "";
    const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN || "";

    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Request body is required" }),
        };
    }

    try {
        const {
            user_id,
            org_name,
            description,
            rewards_roadmap,
            rewards_expenditure,
            reward_planAvail,
            exp_rewardsAvail,
        } = JSON.parse(event.body);

        const organization_id = randomUUID();

        if (!organization_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "organization_id is required" }),
            };
        }

        const fileKeys = [
            `${organization_id}/logo`,  
            `${organization_id}/preview`,
            `${organization_id}/banner`,
        ];

        const publicUrls = fileKeys.map(
            (fileKey) => `https://${CUSTOM_DOMAIN}/${fileKey}`
        );

        const dynamoDbItem: PutCommandInput = {
            TableName: TABLE_NAME,
            Item: {
                organization_id: organization_id,
                owner_id: user_id,
                date_registered: new Date().toISOString(),
                org_name,
                description,
                available: false,
                images: {
                    logo: publicUrls[0],
                    preview: publicUrls[1],
                    banner: publicUrls[2],
                },
            },
        };
        await dynamoDb.send(new PutCommand(dynamoDbItem));

        const preSignedUrls = await Promise.all(
            fileKeys.map(async (fileKey) => {
                const url = await s3.getSignedUrlPromise("putObject", {
                    Bucket: BUCKET_NAME,
                    Key: fileKey,
                    Expires: 300,
                    ContentType: "image/jpeg",
                });
                return { fileKey, url };
            })
        );

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Organization Successfully Setup",
                publicUrls,
                preSignedUrls,
            }),
        };
    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: "Error setting up organization",
                error: error instanceof Error ? error.message : error,
            }),
        };
    }
};
