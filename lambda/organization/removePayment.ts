import { DynamoDBClient} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { OrganizationProps } from "../Interfaces";
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

const removePayment = async (payment_id:string):Promise<{success:boolean}> => {
    try {

        const deletedPayment = await stripe?.paymentMethods.detach(payment_id)

        return{
            success: deletedPayment?.id ? true:false
        }

      } catch (error) {
        return{
            success: false
        }
      }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const userSub = event.requestContext.authorizer?.claims?.sub;
        const paymentId = event.queryStringParameters?.paymentId;

        const orgTable = process.env.ORG_TABLE
        const userTable = process.env.USER_TABLE
        const stripeArn = process.env.STRIPE_ARN;

        switch(true){
            case (!orgTable || !userTable): return { statusCode: 404, body: JSON.stringify({ error: "No Org/Shop Table" }) };
            case ( !userSub || !paymentId): return { statusCode: 404, body: JSON.stringify({ error: "no UserSub/paymentId supplied" }) };
            case (!stripeArn): return { statusCode: 404, body: JSON.stringify({ error: "no Stripe ARN supplied" }) };
        }

        const getUser = new GetCommand ({
            TableName: userTable,
            Key: { id: userSub},
            ProjectionExpression: "orgId, #userPermissions",      
            ExpressionAttributeNames: { 
                "#userPermissions": "permissions"
            },      
        })

        const resultUser = await dynamoDb.send(getUser);

        if (!resultUser.Item?.orgId) {
            return { statusCode: 210, body: JSON.stringify({ info: "User not Found" }) };
        }

        const orgId = resultUser.Item.orgId ;
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

        const {success} = await removePayment(paymentId)

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success
            })
        };

    } catch (error) {
        console.error("Error fetching organization:", error);
        return { statusCode: 501, body: JSON.stringify({ error, success:false })};
    }
};
