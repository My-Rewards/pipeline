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

const getIntent = async (stripe_id:string):Promise<{client_secret:string|null}> => {
    try {

        const setupIntents = await stripe?.setupIntents.list({
            customer: stripe_id,
            limit: 3
        });

        let activeIntent: undefined | Stripe.SetupIntent;

        if(setupIntents && setupIntents?.data.length>=1){
            activeIntent = setupIntents?.data.find(
                (intent) =>
                    intent.status === "requires_confirmation" ||
                    intent.status === "requires_action"
                );
        }

        if(!activeIntent){
            activeIntent = await stripe?.setupIntents.create({
                customer: stripe_id,
                usage: "off_session",
                automatic_payment_methods: {
                    enabled: true
                  },            
            });
        }

        return {
            client_secret:activeIntent ? activeIntent?.client_secret: null
        };

      } catch (error) {
        console.error(error)
        return{
            client_secret: null
        }
      }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const userSub = event.requestContext.authorizer?.claims?.sub;

        const orgTable = process.env.ORG_TABLE
        const userTable = process.env.USER_TABLE
        const stripeArn = process.env.STRIPE_ARN;

        switch(true){
            case (!orgTable || !userTable): return { statusCode: 404, body: JSON.stringify({ error: "No Org/Shop Table" }) };
            case ( !userSub): return { statusCode: 404, body: JSON.stringify({ error: "no UserSub id supplied" }) };
            case (!stripeArn): return { statusCode: 404, body: JSON.stringify({ error: "no Stripe ARN supplied" }) };
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

        const intent = await getIntent(organization.stripe_id)

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                client_secret:intent.client_secret
            })
        };

    } catch (error) {
        console.error("Error fetching organization:", error);
        return { statusCode: 501, body: JSON.stringify({ error, info:'Something went wrong' }) };
    }
};
