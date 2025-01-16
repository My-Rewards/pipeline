import * as square from 'square';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

export const handler = async (event: any) => {
  const { authCode, userSub, codeVerifier } = JSON.parse(event.body);
  
  const tableName = process.env.USERS_TABLE;
  const squareClient = process.env.SQUARE_CLIENT;
  const squareSecret = process.env.SQUARE_SECRET;

  if (!authCode || !userSub || !codeVerifier) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'authCode, userId, and codeVerifier are required' }),
    };
  }

  if(!squareClient || !squareSecret){
    return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Square Cient ID/Secret are required' }),
      };
  }

  try {
    const client = new square.Client({
      environment: square.Environment.Production,
      squareVersion:'2024-12-18'
    });

    const response = await client.oAuthApi.obtainToken({
      clientId: squareClient,
      clientSecret: squareSecret,
      code: 'CODE_FROM_AUTHORIZE',
      grantType: 'authorization_code',
      codeVerifier
    });

    const { accessToken, refreshToken } = response.result;

    const params:UpdateCommandInput = {
      TableName: tableName,
      Key: { id:userSub },
      UpdateExpression: 'SET accessToken = :accessToken, refreshToken = :refreshToken, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':accessToken': accessToken,
        ':refreshToken': refreshToken,
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'UPDATED_NEW',
    };

    const result = await dynamoDb.send(new UpdateCommand(params));
    console.log('Update Result:', result);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Tokens saved successfully' }),
    };
  } catch (error) {
    console.error('Error exchanging token:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to retrieve or store tokens' }),
    };
  }
};