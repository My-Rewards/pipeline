import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import Stripe from "stripe";

const secretClient = new SecretsManagerClient({ region: "us-east-1" });

export const dfPM = async (stripe_id:string, stripe:Stripe):Promise<boolean> =>{
    const customerResponse = await stripe?.customers.retrieve(stripe_id);
    const subscriptions = await stripe?.subscriptions.list({
        customer: stripe_id,
        status: "active",
        limit: 1,
    });
    
    const hasDefaultPaymentMethod =
    !customerResponse?.deleted && 
    (typeof customerResponse?.invoice_settings?.default_payment_method === 'string' ||
     !!customerResponse?.invoice_settings?.default_payment_method?.id);

    return (hasDefaultPaymentMethod && subscriptions?.data.length===1);

}   

export const getStripeSecret = async (stripeArn:string): Promise<string | null> => {
    const data = await secretClient.send(new GetSecretValueCommand({ SecretId: stripeArn }));

    if (!data.SecretString) {
        throw new Error("Stripe key not found in Secrets Manager.");
    }

    const secret = JSON.parse(data.SecretString);
    return secret.secretKey;
};