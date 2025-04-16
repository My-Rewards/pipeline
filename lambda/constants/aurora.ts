import { Client } from 'pg';
import { SecretsManager } from 'aws-sdk';
import {DATABASE_NAME} from "../../global/constants";

const secrets = new SecretsManager();

export const connectToAurora = async (secretArn: string) => {
    try {
        const secretValue = await secrets.getSecretValue({ SecretId: secretArn }).promise();
        const dbCredentials = JSON.parse(secretValue.SecretString || '{}');

        const client = new Client({
            host: dbCredentials.host,
            port: 5432,
            user: 'app_user',
            password: dbCredentials.password,
            database: DATABASE_NAME
        });

        await client.connect();
        return client;
    } catch (error) {
        console.error('Error connecting to Aurora:', error);
        throw error;
    }
};
