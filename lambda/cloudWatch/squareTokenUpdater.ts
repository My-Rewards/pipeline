import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, ScanCommandInput, UpdateCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import * as square from 'square';
import { fetchSquareSecret } from '../constants/square';

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

interface OrganizationSquare {
    id: string;
    expires_at?: string;
    refresh_token?: string;
    access_token?: string;
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

        const now = new Date();
        const twentyFourHoursFromNow = new Date(now.getTime() + (24 * 60 * 60 * 1000));
        const OldestDate = twentyFourHoursFromNow.toISOString();

        const secretResult = await fetchSquareSecret(squareSecretArn);

        const scanParams = new ScanCommand({
            TableName: orgTable,
            FilterExpression: 'attribute_exists(refresh_token) AND expires_at <= :expirationDate',
            ExpressionAttributeValues: {
                ':expirationDate': OldestDate
            }
        });

        const { Items = [] } = await dynamoDb.send(scanParams);
        const organizations = Items as OrganizationSquare[];

        const client = new square.SquareClient({
            environment: app_env === 'prod'? square.SquareEnvironment.Production : square.SquareEnvironment.Sandbox,
        });

        const updatePromises = organizations.map(async (org) => {
            if (!org.expires_at || !org.refresh_token) return;

            const twentyFourHoursFromNow = new Date();
            twentyFourHoursFromNow.setHours(twentyFourHoursFromNow.getHours() + 24);

            try {
                const response = await client.oAuth.obtainToken({
                    clientId: secretResult.client,
                    clientSecret: secretResult.secret,
                    grantType: 'refresh_token',
                    refreshToken: org.refresh_token,
                });

                if (response.accessToken && response.refreshTokenExpiresAt && response.refreshToken) {
                    const newExpirationDate = new Date(response.refreshTokenExpiresAt);

                    const updateParams = new UpdateCommand({
                        TableName: orgTable,
                        Key: { id: org.id },
                        UpdateExpression: 'SET access_token = :token, expires_at = :expiration, refresh_token = :refresh',
                        ExpressionAttributeValues: {
                            ':token': response.accessToken,
                            ':expiration': newExpirationDate.toISOString(),
                            ':refresh': response.refreshToken,
                        },
                    });

                    await dynamoDb.send(updateParams);
                }
            } catch (error) {
                console.error(`Error refreshing token for organization ${org.id}:`, error);
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