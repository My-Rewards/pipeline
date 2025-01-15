const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const axios = require('axios');
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager();

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

async function getSquareCredentials() {
    try {
        const secretData = await secretsManager.getSecretValue({ SecretId: 'square/credentials' }).promise();
        const { client_id, client_secret } = JSON.parse(secretData.SecretString);
        return { client_id, client_secret };        
    } catch (error) {
        console.error('Error retrieving credentials:', error);
        throw new Error('Failed to retrieve Square credentials');
    }
}

exports.handler = async (event) => {
    const { authCode, userId, codeVerifier } = JSON.parse(event.body);
    const tableName = process.env.USERS_TABLE;

    if (!authCode || !userId || !codeVerifier) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'authCode, userId, and codeVerifier are required' }),
        };
    }

    try {
        // Retrieve the client ID and secret from Secrets Manager
        const { client_id, client_secret } = await getSquareCredentials();

        // Exchange authCode for access_token and refresh_token using PKCE
        const response = await axios.post('https://connect.squareup.com/oauth2/token', {
            client_id,
            client_secret,
            code: authCode,
            grant_type: 'authorization_code',
            code_verifier: codeVerifier,
        });

        const { access_token, refresh_token } = response.data;

        // Update or insert tokens in DynamoDB
        const params = {
            TableName: tableName,
            Key: { userId },
            UpdateExpression: 'SET accessToken = :accessToken, refreshToken = :refreshToken, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':accessToken': access_token,
                ':refreshToken': refresh_token,
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
