import { DynamoDBClient} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { OrganizationProps } from "../Interfaces";
import Stripe from "stripe";
import { dfPM, getStripeSecret } from "../constants/validOrganization";
import { STRIPE_API_VERSION } from "../../global/constants";

const dynamoClient = new DynamoDBClient({region: "us-east-1"});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

let cachedStripeKey: string | null; 
let stripe: Stripe| null;

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
            ProjectionExpression: "stripe_id, linked, active",            
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
            stripe = new Stripe(cachedStripeKey, { apiVersion: STRIPE_API_VERSION });
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

        let status = organization.active;
        const hasDfPM = await dfPM(org.Item.stripe_id, stripe);

        if(!hasDfPM){
            const updateOrg = new UpdateCommand({
                TableName: orgTable,
                Key: { id: orgId },
                UpdateExpression: 'SET active = :active, updated_at = :updatedAt',
                ExpressionAttributeValues: {
                ':active': false,
                ':updatedAt': new Date().toISOString()
                },
                ReturnValues: 'UPDATED_NEW'
            });
            status = !org.Item.active
        
            await dynamoDb.send(updateOrg);
        }

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
