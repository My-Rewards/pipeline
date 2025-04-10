import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, ScanCommandInput, UpdateCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import * as square from 'square';

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

interface OrganizationSquare {
    id: string;
    squareAccessToken?: string;
    squareTokenExpiration?: string;
    squareRefreshToken?: string;
}

export const handler = async () => {
    try {
        const orgTable = process.env.ORG_TABLE;
        const squareSecretArn = process.env.SQUARE_ARN
        const kmsKeyId = process.env.KMS_KEY_ID;
        const app_env = process.env.APP_ENV;
      
        switch(true){
          case(!squareSecretArn || !app_env):
            return {
              statusCode: 500,
              body: JSON.stringify({ error: 'Square ARN required' }),
            };
          case !kmsKeyId:
            return {
              statusCode: 500,
              body: JSON.stringify({ error: 'KMS Key ID is not configured' }),
            };
        }

        const twentyFourHoursFromNow = new Date();
        twentyFourHoursFromNow.setHours(twentyFourHoursFromNow.getHours() + 24);

        const scanParams:ScanCommandInput = {
            TableName: orgTable,
            FilterExpression: 'attribute_exists(accessToken) AND attribute_exists(refreshToken) AND expiresAt <= :expirationDate',
            ExpressionAttributeValues: {
                ':expirationDate': twentyFourHoursFromNow.toISOString()
            }
        };
        const { Items = [] } = await dynamoDb.send(new ScanCommand(scanParams));
        const organizations = Items as OrganizationSquare[];

        const client = new square.SquareClient({
            environment: app_env === 'prod'? square.SquareEnvironment.Production : square.SquareEnvironment.Sandbox,
        });

        const updatePromises = organizations.map(async (org) => {
            if (!org.squareTokenExpiration || !org.squareRefreshToken) return;

            const expirationDate = new Date(org.squareTokenExpiration);
            const twentyFourHoursFromNow = new Date();
            twentyFourHoursFromNow.setHours(twentyFourHoursFromNow.getHours() + 24);

            if (expirationDate <= twentyFourHoursFromNow) {
                try {
                    const response = await client.oAuth.obtainToken({
                        clientId: process.env.SQUARE_CLIENT_ID || '',
                        clientSecret: process.env.SQUARE_CLIENT_SECRET || '',
                        grantType: 'refresh_token',
                        refreshToken: org.squareRefreshToken,
                    });

                    if (response.accessToken && response.refreshTokenExpiresAt) {
                        const newExpirationDate = new Date(response.refreshTokenExpiresAt);

                        const updateParams:UpdateCommandInput = {
                            TableName: process.env.ORGANIZATIONS_TABLE,
                            Key: { id: org.id },
                            UpdateExpression: 'set accessToken = :token, expiresAt = :expiration, refreshToken = :refresh',
                            ExpressionAttributeValues: {
                                ':token': response.accessToken,
                                ':expiration': newExpirationDate.toISOString(),
                                ':refresh': response.refreshToken,
                            },
                        };

                        await dynamoDb.send(new UpdateCommand(updateParams));
                    }
                } catch (error) {
                    console.error(`Error refreshing token for organization ${org.id}:`, error);
                }
            }
        });

        await Promise.all(updatePromises);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Token update process completed successfully' }),
        };
    } catch (error) {
        console.error('Error in token update process:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to process token updates' }),
        };
    }
};