import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";
const secretClient = new SecretsManagerClient({ region: "us-east-1" });

export const fetchSquareSecret = async (secretARN:string): Promise<{secret:string, client:string}> => {
    const data = await secretClient.send(new GetSecretValueCommand({ SecretId: secretARN }));

    if (!data.SecretString) {
        throw new Error("Square key not found in Secrets Manager.");
    }

    const secret = JSON.parse(data.SecretString);

    return {
        client: secret.client_id,
        secret: secret.client_secret
    };
};