import * as square from 'square';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, } from '@aws-sdk/lib-dynamodb';
import { KMSClient, EncryptCommand } from '@aws-sdk/client-kms';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand} from "@aws-sdk/client-secrets-manager"
import { OrganizationProps } from '../Interfaces';

const dynamoClient = new DynamoDBClient({region: "us-east-1" });
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const kmsClient = new KMSClient({});
const secretClient = new SecretsManagerClient({ region: "us-east-1" });

let cachedSquareSecret: string | null; 
let cacheSquareClient: string | null; 

const fetchSquareSecret = async (): Promise<{secret:string, client:string}> => {
    const data = await secretClient.send(new GetSecretValueCommand({ SecretId: process.env.SQUARE_ARN }));

    if (!data.SecretString) {
        throw new Error("Square key not found in Secrets Manager.");
    }

    const secret = JSON.parse(data.SecretString);

    return {
      client: secret.client_id,
      secret: secret.client_secret
    };
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return {
        statusCode: 400,
        body: JSON.stringify({ error: "Request body is required" }),
    };
  }

  const { authCode, userSub } = JSON.parse(event.body);
  
  const userTable = process.env.USER_TABLE;
  const orgTable = process.env.ORG_TABLE;
  const squareSecretArn = process.env.SQUARE_ARN
  const kmsKeyId = process.env.KMS_KEY_ID;
  const app_env = process.env.APP_ENV;

  switch(true){
    case (!authCode || !userSub):
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'authCode, userId, and codeVerifier are required' }),
      };
    case(!squareSecretArn):
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Square ARN required' }),
      };
    case !userTable || !orgTable:
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Square Missing Table Name' }),
      };
    case !kmsKeyId:
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'KMS Key ID is not configured' }),
      };
  }

  try {
    const getUser = new GetCommand({
      TableName: userTable,
      Key: { id: userSub},
      ProjectionExpression: "org_id",
    });

    const userResult = await dynamoDb.send(getUser);

    if(!userResult?.Item || !userResult.Item.org_id){
      return { statusCode: 210, body: JSON.stringify({ info: "User not found" }) };
    }

    const getOrg = new GetCommand({
      TableName: orgTable,
      Key: { id: userResult.Item.org_id },
    });

    const orgResult = await dynamoDb.send(getOrg);

    if (!orgResult.Item) {
      return { statusCode: 210, body: JSON.stringify({ info: "Organization not found" }) };
    }

    const organization = orgResult.Item as OrganizationProps

    if(organization.owner_id !== userSub ){
      return { statusCode: 404, body: JSON.stringify({ error: "Unauthorized" }) };
    }
        
    const client = new square.SquareClient({
      environment: app_env === 'prod'? square.SquareEnvironment.Production : square.SquareEnvironment.Sandbox,
    });

    if (!cachedSquareSecret || !cacheSquareClient) {
      const secretResult = await fetchSquareSecret();

      cacheSquareClient = secretResult.client;
      cachedSquareSecret = secretResult.secret;

      if (!cachedSquareSecret || !cacheSquareClient) return { statusCode: 404, body: JSON.stringify({ error: "Failed to retrieve Square secret key" }) };
    }

    const response = await client.oAuth.obtainToken({
      clientId: cacheSquareClient,
      clientSecret: cachedSquareSecret,
      code: authCode,
      grantType: 'authorization_code',
      shortLived:false
    });

    const { accessToken, refreshToken, expiresAt } = response;

    if(!accessToken || !refreshToken){
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to retrieve tokens' }),
      };
    }

    const verifiedClient = new square.SquareClient({
      environment: app_env === 'prod'? square.SquareEnvironment.Production : square.SquareEnvironment.Sandbox,
      token:accessToken
    });

    const merchant = await verifiedClient.merchants.list()

    if(!merchant.data){
        return { statusCode: 404, body: JSON.stringify({ error: "Square merchant not retrieved" }) };
    }

    const encryptToken = async (token: string) => {
      const command = new EncryptCommand({
        KeyId: kmsKeyId,
        Plaintext: Buffer.from(token),
      });
      const encrypted = await kmsClient.send(command);
      if(!encrypted.CiphertextBlob) return null;
      return String.fromCharCode(...encrypted.CiphertextBlob);
    };

    const encryptedAccessToken = await encryptToken(accessToken);
    const encryptedRefreshToken = await encryptToken(refreshToken);

    if(!encryptedAccessToken || !encryptedRefreshToken){
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to encrypt tokens' }),
      };
    }

    const updateOrg = new UpdateCommand({
      TableName: orgTable,
      Key: { id: organization.id },
      UpdateExpression: 'SET accessToken = :accessToken, refreshToken = :refreshToken, updatedAt = :updatedAt, expiresAt = :expiresAt, square_merchant_id = :square_merchant_id, linked = :linked',
      ExpressionAttributeValues: {
        ':accessToken': encryptedAccessToken,
        ':refreshToken': encryptedRefreshToken,
        ':updatedAt': new Date().toISOString(),
        ':expiresAt': expiresAt,
        ":square_merchant_id": merchant.data[0].id,
        ":linked":true
      },
      ReturnValues: 'UPDATED_NEW'
    });

    await dynamoDb.send(updateOrg);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Tokens saved successfully' }),
    };

  } 
  catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed', 
        details: error
      }),    
    };
  }
};