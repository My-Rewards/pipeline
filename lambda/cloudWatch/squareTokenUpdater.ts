import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
// import Square from 'square';

const s3 = new S3Client({ region: "us-east-1" });
const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

let cachedStripeKey: string | null;

exports.handler = async () => {
    return {
        statusCode: 200,
        body: JSON.stringify('Success'),
    };
};