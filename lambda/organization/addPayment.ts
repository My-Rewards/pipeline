import { DynamoDBClient} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { OrganizationProps } from "../Interfaces";
import Stripe from "stripe";
import { getStripeSecret } from "../constants/validOrganization";

const dynamoClient = new DynamoDBClient({region: "us-east-1"});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

let cachedStripeKey: string | null; 
let stripe: Stripe| null;

const getIntent = async (stripe_id:string):Promise<{client_secret:string|null, first_pm:boolean}> => {
    try {
        const currPaymentMethods = await stripe?.customers.listPaymentMethods(stripe_id,{
            limit:3
        });

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
            client_secret:activeIntent ? activeIntent?.client_secret: null,
            first_pm: !currPaymentMethods?.data || currPaymentMethods.data.length === 0

        };

      } catch (error) {
        console.error(error)
        return{
            client_secret: null,
            first_pm:false
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
            case (!orgTable || !userTable): return { statusCode: 500, body: JSON.stringify({ error: "No Org/Shop Table" }) };
            case (!userSub): return { statusCode: 404, body: JSON.stringify({ error: "no UserSub id supplied" }) };
            case (!stripeArn): return { statusCode: 500, body: JSON.stringify({ error: "no Stripe ARN supplied" }) };
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

        if(!organization.stripe_id){
            return { 
                statusCode: 220, 
                body: JSON.stringify({ info:'Organization Payment not Setup' })
            };
        }

        const {client_secret, first_pm} = await getIntent(organization.stripe_id)

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                client_secret,
                first_pm
            })
        };

    } catch (error) {
        console.error("Error fetching organization:", error);
        return { statusCode: 501, body: JSON.stringify({ error, info:'Something went wrong' }) };
    }
};
