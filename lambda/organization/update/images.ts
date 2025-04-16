import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const s3 = new S3Client({ region: "us-east-1" });
const cloudfront = new CloudFrontClient({ region: "us-east-1" });

const invalidateCloudFrontPath = async (distributionId: string, path: string) => {
  const command = new CreateInvalidationCommand({
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: `${Date.now()}-${path}`,
      Paths: {
        Quantity: 1,
        Items: [path.startsWith("/") ? path : `/${path}`]
      }
    }
  });

  await cloudfront.send(command);
};

const getPresignedUrl = (fileKey: string, bucketName: string) => {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileKey,
    ContentType: "image/jpeg",
    CacheControl: 'no-cache'
  });

  return getSignedUrl(s3, command, { expiresIn: 30 });
};

const getImageUrl = (images: {
  [key: string]: { url: string; fileKey: string }
}, type: string): { url: string; fileKey: string } => {
  return images[type];
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return { statusCode: 400, body: "Request body is required" };
  }

  const orgTable = process.env.ORG_TABLE;
  const userTable = process.env.USER_TABLE;
  const userSub = event.requestContext.authorizer?.claims?.sub;
  const bucketName = process.env.BUCKET_NAME;
  const cloudfrontDistributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;

  switch(true){
    case (!orgTable || !userTable || !bucketName || !cloudfrontDistributionId):
      return { statusCode: 500, body: "Missing env variable" };
    case (!userSub):
      return { statusCode: 500, body: "Missing User id" };  
  }

  try {
    const { imageType } = JSON.parse(event.body);

    const getUser = new GetCommand({
      TableName: userTable,
      Key: {id: userSub},
      ProjectionExpression: "orgId, #userPermissions",
      ExpressionAttributeNames: { 
        "#userPermissions": "permissions"
      }
    });
      
    const resultUser = await dynamoDb.send(getUser);
    
    if (!resultUser.Item?.orgId) {
      return { statusCode: 210, body: JSON.stringify({ info: "Organization not Found" }) };
    }
    
    const orgId = resultUser.Item.orgId;
    const permissions = resultUser.Item.permissions;

    const getOrg = new GetCommand({
        TableName: orgTable,
        Key: { id: orgId },
        ProjectionExpression: "images"
    });
    
    const resultOrg = await dynamoDb.send(getOrg);

    if(!resultOrg || !resultOrg.Item){
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Failed to get Organization"})
      };
    }

    const image = getImageUrl(resultOrg.Item.images, imageType);
    const preSignedUrl = await getPresignedUrl(image.fileKey, bucketName)

    try {
      await invalidateCloudFrontPath(cloudfrontDistributionId, image.fileKey);
    } catch (err) {
      console.error("CloudFront invalidation failed:", err);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Update successfull", preSignedUrl}),
    };
  } catch (error) {
    console.error("Update failed:", error);
    return { statusCode: 500, body: JSON.stringify({ message: "Internal server error", error }) };
  }
};
