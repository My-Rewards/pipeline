import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { OrganizationProps } from '../../Interfaces';
import {ExecuteStatementCommand, RDSDataClient} from "@aws-sdk/client-rds-data";

const dynamoClient = new DynamoDBClient({region: "us-east-1" });
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const rdsClient = new RDSDataClient({ region: "us-east-1" });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const userSub = event.requestContext.authorizer?.claims?.sub;

  const userTable = process.env.USER_TABLE;
  const orgTable = process.env.ORG_TABLE;
  const clusterSecretArn = process.env.CLUSTER_SECRET_ARN
  const clusterArn = process.env.CLUSTER_ARN
  const dbName = process.env.DB_NAME

  switch(true){
    case (!userSub):
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'missing user id' }),
      };
    case !clusterSecretArn: return{statusCode:404, body:'Missing Aurora Secret ARN in ENV'};
    case !clusterArn: return{statusCode:404, body:'Missing Aurora ARN in ENV'};
    case !dbName: return{statusCode:404, body:'Missing DB Name in ENV'};
  }

  try {
    const getUser = new GetCommand({
      TableName: userTable,
      Key: { id: userSub},
      ProjectionExpression: "org_id, #userPermissions",
      ExpressionAttributeNames: { 
        "#userPermissions": "permissions"
      }   
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
      return { statusCode: 401, body: JSON.stringify({ error: "Only Organization owner may unlink Organization" }) };
    }

    const updateOrg = new UpdateCommand({
      TableName: orgTable,
      Key: { id: organization.id },
      UpdateExpression: 'SET access_token = :accessToken, refreshToken = :refresh_token, updated_at = :updatedAt, expires_at = :expiresAt, square_merchant_id = :square_merchant_id, linked = :linked, active=:active',
      ExpressionAttributeValues: {
        ':accessToken': null,
        ':refreshToken': null,
        ':updatedAt': new Date().toISOString(),
        ':expiresAt': null,
        ":square_merchant_id": null,
        ":linked":false,
        ":active":false,
      },
      ReturnValues: 'UPDATED_NEW'
    });

    const auroraResult = await rdsClient.send(
        new ExecuteStatementCommand({
          secretArn: clusterSecretArn,
          resourceArn: clusterArn,
          database: dbName,
          sql:`
                UPDATE Organizations SET active = :active WHERE id = :orgId
          `,
          parameters: [
            { name: "active", value: { booleanValue: false} },
            { name: "orgId", value: { stringValue: organization.id } }
          ],
        })
    );

    if(auroraResult.numberOfRecordsUpdated ?? 0 >= 1){
      await dynamoDb.send(updateOrg);
    }

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