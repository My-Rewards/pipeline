const AWS = require('aws-sdk');
const axios = require('axios');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const secretsManager = new AWS.SecretsManager();

async function getSecret(secretName) {
    try {
        const secretData = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
        return secretData;
    } catch (error) {
        console.error(`Error retrieving secret ${secretName}:`, error);
        throw new Error(`Failed to retrieve secret: ${secretName}`);
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
        const client_id = await getSecret('square/client_id');
        const client_secret = await getSecret('square/client_secret');

        const response = await axios.post('https://connect.squareup.com/oauth2/token', {
            client_id,
            client_secret,
            code: authCode,
            grant_type: 'authorization_code',
            code_verifier: codeVerifier,
        });

        const { access_token, refresh_token } = response.data;

        const params = {
            TableName: tableName,
            Item: {
                userId,
                accessToken: access_token,
                refreshToken: refresh_token,
                updatedAt: new Date().toISOString(),
            },
        };

        await dynamoDB.put(params).promise();

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
