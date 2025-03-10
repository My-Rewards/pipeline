import { DynamoDBClient} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { OrganizationProps, ShopProps } from "../Interfaces";
import { SecretsManagerClient, GetSecretValueCommand} from "@aws-sdk/client-secrets-manager"
import Stripe from "stripe";

const dynamoClient = new DynamoDBClient({region: "us-east-1"});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const secretClient = new SecretsManagerClient({ region: "us-east-1" });

let cachedStripeKey: string | null; 
let stripe: Stripe| null;

const getStripeSecret = async (stripeArn:string): Promise<string | null> => {
    const data = await secretClient.send(new GetSecretValueCommand({ SecretId: stripeArn }));

    if (!data.SecretString) {
        throw new Error("Stripe key not found in Secrets Manager.");
    }

    const secret = JSON.parse(data.SecretString);
    return secret.secretKey;
};

const setDefaultPM = async (stripe_id:string, meterPrice:string, pm_id:string):Promise<{success:boolean}> => {
    try {

        const subscriptions = await stripe?.subscriptions.list({
            customer: stripe_id,
            status: "active",
            limit: 1,
        });

        if(!subscriptions || subscriptions?.data.length === 0){
            await stripe?.subscriptions.create({
                customer: stripe_id,
                items: [
                    {
                        price: meterPrice,
                        tax_rates: ["txr_123456789"]
                    },
                ],
            });
        }

        const paymentMethodConfig = await stripe?.paymentMethods.retrieve(pm_id);

        if(!paymentMethodConfig?.id) return{success:false};

        await stripe?.customers.update(stripe_id, {
            invoice_settings: {
                default_payment_method: pm_id,
            }
        });

        return{
            success:true
        }

      } catch (error) {
        console.error(error)
        return{
            success: false
        }
      }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Request body is required" }),
        };
    }

    try {
        const userSub = event.requestContext.authorizer?.claims?.sub;

        const orgTable = process.env.ORG_TABLE
        const userTable = process.env.USER_TABLE
        const stripeArn = process.env.STRIPE_ARN;
        const meterPrice = process.env.METER_PRICE;

        const { paymentMethod } = JSON.parse(event.body);

        switch(true){
            case (!orgTable || !userTable): return { statusCode: 404, body: JSON.stringify({ error: "No Org/Shop Table" }) };
            case ( !userSub): return { statusCode: 404, body: JSON.stringify({ error: "no UserSub id" }) };
            case (!stripeArn): return { statusCode: 404, body: JSON.stringify({ error: "no Stripe ARN in env" }) };
            case (!paymentMethod): return { statusCode: 404, body: JSON.stringify({ error: "no payment ID supplied" }) };
            case (!meterPrice): return { statusCode: 404, body: JSON.stringify({ error: "no meterPrice in env" }) };
        }

        const getUser = new GetCommand ({
            TableName: userTable,
            Key: { id: userSub},
            ProjectionExpression: "org_id, #userPermissions",      
            ExpressionAttributeNames: { 
                "#userPermissions": "permissions"
            },      
        })

        const resultUser = await dynamoDb.send(getUser);

        if (!resultUser.Item?.org_id) {
            return { statusCode: 210, body: JSON.stringify({ info: "User not Found" }) };
        }

        const orgId = resultUser.Item.org_id ;
        const permissions = resultUser.Item.permissions;
        
        const getOrg = new GetCommand({
            TableName: orgTable,
            Key: { id: orgId },
            ProjectionExpression: "stripe_id, linked",            
        });

        const org = await dynamoDb.send(getOrg);
        
        if (!org.Item) {
            return { statusCode: 210, body: JSON.stringify({ info: "Organization not found" }) };
        }

        if (!cachedStripeKey) {
            cachedStripeKey = await getStripeSecret(stripeArn);
            if (!cachedStripeKey) return { statusCode: 404, body: JSON.stringify({ error: "Failed to retrieve Stripe secret key" }) };
        } 

        if(!stripe){
            stripe = new Stripe(cachedStripeKey, { apiVersion: "2025-01-27.acacia" });
            if (!stripe) return { statusCode: 404, body: JSON.stringify({ error: "Failed to open stripe Client" }) };
        }

        const organization = org.Item as OrganizationProps;

        if(!organization?.linked){
            return { 
                statusCode: 211, 
                body: JSON.stringify({ info:'Organization not Linked' })
            };
        }

        if(!organization.stripe_id){
            return { 
                statusCode: 220, 
                body: JSON.stringify({ info:'Organization Payment not Setup' })
            };
        }

        const {success} = await setDefaultPM(organization.stripe_id, meterPrice, paymentMethod)

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success
            })
        };

    } catch (error) {
        console.error("Error fetching organization:", error);
        return { statusCode: 501, body: JSON.stringify({ error, info:'Something went wrong' }) };
    }
};
