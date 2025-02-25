import * as square from 'square';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import { KMSClient, EncryptCommand } from '@aws-sdk/client-kms';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);
const kmsClient = new KMSClient({});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return {
        statusCode: 400,
        body: JSON.stringify({ error: "Request body is required" }),
    };
  }

  const { authCode, userSub } = JSON.parse(event.body);
  
  const tableName = process.env.USERS_TABLE;
  const squareClient = process.env.SQUARE_CLIENT;
  const squareSecret = process.env.SQUARE_SECRET;
  const kmsKeyId = process.env.KMS_KEY_ID;
  const app_env = process.env.ENV;

  switch(true){
    case (!authCode || !userSub):
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'authCode, userId, and codeVerifier are required' }),
      };

    case(!squareClient || !squareSecret):
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'authCode, userId, and codeVerifier are required' }),
      };

    case !tableName:
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Square Cient ID/Secret are required' }),
      };

    case !kmsKeyId:
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'KMS Key ID is not configured' }),
      };
  }

  try {
    const client = new square.SquareClient({
      environment: app_env === 'prod'? square.SquareEnvironment.Production : square.SquareEnvironment.Sandbox,
      version:'2025-01-23'
    });

    const response = await client.oAuth.obtainToken({
      clientId: squareClient,
      clientSecret: squareSecret,
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

    const params:UpdateCommandInput = {
      TableName: tableName,
      Key: { id:userSub },
      UpdateExpression: 'SET accessToken = :accessToken, refreshToken = :refreshToken, updatedAt = :updatedAt, expiresAt = :expiresAt',
      ExpressionAttributeValues: {
        ':accessToken': encryptedAccessToken,
        ':refreshToken': encryptedRefreshToken,
        ':updatedAt': new Date().toISOString(),
        ':expiresAt': expiresAt,

      },
      ReturnValues: 'UPDATED_NEW',
    };
    try {
      const result = await dynamoDb.send(new UpdateCommand(params));
    } catch (updateError) {
      console.error('DynamoDB Update Error:', updateError);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Failed to store tokens', 
          details: updateError 
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Tokens saved successfully' }),
    };
  } catch (error) {
    console.error('Error exchanging token:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed', 
        details: error 
      }),    
    };
  }
};