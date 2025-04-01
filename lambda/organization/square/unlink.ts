import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { OrganizationProps } from '../../Interfaces';

const dynamoClient = new DynamoDBClient({region: "us-east-1" });
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const userSub = event.requestContext.authorizer?.claims?.sub;

  const userTable = process.env.USER_TABLE;
  const orgTable = process.env.ORG_TABLE;

  switch(true){
    case (!userSub):
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'missing user id' }),
      };
    case !userTable || !orgTable:
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing Table Name (env)' }),
      };
  }

  try {
    const getUser = new GetCommand({
      TableName: userTable,
      Key: { id: userSub},
      ProjectionExpression: "orgId, #userPermissions",      
      ExpressionAttributeNames: { 
        "#userPermissions": "permissions"
      }   
    });

    const userResult = await dynamoDb.send(getUser);

    if(!userResult?.Item || !userResult.Item.orgId){
      return { statusCode: 210, body: JSON.stringify({ info: "User not found" }) };
    }

    const getOrg = new GetCommand({
      TableName: orgTable,
      Key: { id: userResult.Item.orgId },
    });

    const orgResult = await dynamoDb.send(getOrg);

    if (!orgResult.Item) {
      return { statusCode: 210, body: JSON.stringify({ info: "Organization not found" }) };
    }

    const organization = orgResult.Item as OrganizationProps

    if(organization.owner_id !== userSub ){
      return { statusCode: 401, body: JSON.stringify({ error: "Only Organization owner may unlink Organization" }) };
    }

    const updateOrg = new UpdateCommand({
      TableName: orgTable,
      Key: { id: organization.id },
      UpdateExpression: 'SET accessToken = :accessToken, refreshToken = :refreshToken, updatedAt = :updatedAt, expiresAt = :expiresAt, square_merchant_id = :square_merchant_id, linked = :linked',
      ExpressionAttributeValues: {
        ':accessToken': null,
        ':refreshToken': null,
        ':updatedAt': new Date().toISOString(),
        ':expiresAt': null,
        ":square_merchant_id": null,
        ":linked":false
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