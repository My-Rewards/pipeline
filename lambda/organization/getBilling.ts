import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import Stripe from "stripe";
import { StripeBillingProps, StripeInvoice } from "../Interfaces";
import { getStripeSecret } from "../constants/validOrganization";
import { STRIPE_API_VERSION } from "../../global/constants";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

interface stripeClientProps{
    success: boolean,
    value: StripeBillingProps|null
}

let cachedStripeKey: string | null; 
let stripe: Stripe| null;

const getStripe = async (stripe_id:string):Promise<stripeClientProps> => {
    try {

        const paymentMethods = await stripe?.customers.listPaymentMethods(
            stripe_id,
            {
            limit: 3,
            }
        );

        const customerResponse = await stripe?.customers.retrieve(stripe_id);

        const subscriptions = await stripe?.subscriptions.list({
            customer: stripe_id,
            status: "active",
            limit: 1,
        });

        if(!subscriptions || subscriptions?.data.length === 0){
            return{
                success:true,
                value:{
                    total: 0,
                    tax: 0,
                    currPaymentMethod: (customerResponse && !customerResponse?.deleted) 
                    ? (typeof customerResponse.invoice_settings.default_payment_method === 'string' 
                       ? customerResponse.invoice_settings.default_payment_method 
                       : customerResponse.invoice_settings.default_payment_method?.id || null)
                    : null,
                    active:false,
                    paymentWindow:{
                        start: null,
                        end: null
                    },
                    invoices:[],
                    paymentMethods: paymentMethods ? paymentMethods.data : []
                },
            }
        }

        const subscription = subscriptions.data[0];

        const upcomingInvoice = await stripe?.invoices.createPreview({
            customer: stripe_id,
            subscription: subscription.id,
        });

        const pastInvoices = await stripe?.invoices.list({
            customer: stripe_id,
            subscription: subscription.id,
            limit: 50,
        });

        let allInvoices:StripeInvoice[] = [];

        if (upcomingInvoice) {
            allInvoices.push({
                total: upcomingInvoice.total,
                amount_due: upcomingInvoice.amount_due,
                created: upcomingInvoice.created,
                period_start: upcomingInvoice.period_start,
                period_end: upcomingInvoice.period_end,
                download: null,
                upcoming: true,
                paid: false,
            });
        }
        
        const sortedPastInvoices = pastInvoices?.data
            .slice()
            .sort((a, b) => a.created - b.created) || [];
        
        sortedPastInvoices.forEach((invoice) => {
            allInvoices.push({
                id: invoice.id,
                total: invoice.total,
                amount_due: invoice.amount_due,
                created: invoice.created,
                period_start: invoice.period_start,
                period_end: invoice.period_end,
                upcoming: false,
                download:invoice.invoice_pdf || null,
                paid: invoice.status == 'paid',
            });
        });
        
        return {
            success:true,
            value:{
                total: upcomingInvoice ? upcomingInvoice.total_excluding_tax : null,
                currPaymentMethod: (customerResponse && !customerResponse?.deleted) 
                ? (typeof customerResponse.invoice_settings.default_payment_method === 'string' 
                   ? customerResponse.invoice_settings.default_payment_method 
                   : customerResponse.invoice_settings.default_payment_method?.id || null)
                : null,
                tax: upcomingInvoice?.total_taxes?.[0]?.amount || null,
                active: true,
                paymentWindow:{
                    start: subscription.items.data[0].current_period_start,
                    end: subscription.items.data[0].current_period_end
                },
                invoices: allInvoices,
                paymentMethods: paymentMethods ? paymentMethods.data : []
            }
        };

      } catch (error) {
        console.error(error)
        return{
            success:false,
            value:null
        }
      }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const userSub = event.requestContext.authorizer?.claims?.sub;
        
        const orgTable = process.env.ORG_TABLE;
        const userTable = process.env.USER_TABLE;
        const stripeArn = process.env.STRIPE_ARN;

        switch(true){
            case (!orgTable || !userTable): return { statusCode: 500, body: JSON.stringify({ error: "No Org/User Table" }) };
            case (!userSub): return { statusCode: 401, body: JSON.stringify({ error: "no userID supplied" }) };
            case (!stripeArn): return { statusCode: 500, body: JSON.stringify({ error: "Missing Stripe Arn" }) };
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
            return { statusCode: 210, body: JSON.stringify({ info: "Organization not Found" }) };
        }

        const orgId = resultUser.Item.org_id ;
        const permissions = resultUser.Item.permissions;

        if (!orgId) {
            return { statusCode: 404, body: JSON.stringify({ info: "User not found" }) };
        }

        const getOrg = new GetCommand ({
            TableName: orgTable,
            Key: { id: orgId},
            ProjectionExpression: "stripe_id, linked, #orgName, images, date_registered, active",
            ExpressionAttributeNames: { 
                "#orgName": "name"
            },
        })

        const org = await dynamoDb.send(getOrg);

        if(!org.Item){
            return { statusCode: 210, body: JSON.stringify({ info: "Organization not found" }) };
        }

        if(!org.Item.linked){
            return { statusCode: 211, body: JSON.stringify({ info: "Organization not Linked" }) };
        }


        if (!cachedStripeKey) {
            cachedStripeKey = await getStripeSecret(stripeArn);
            console.log(cachedStripeKey);
            if (!cachedStripeKey) return { statusCode: 404, body: JSON.stringify({ error: "Failed to retrieve Stripe secret key" }) };
        } 

        if(!stripe){
            stripe = new Stripe(cachedStripeKey, { apiVersion: STRIPE_API_VERSION });
            if (!stripe) return { statusCode: 404, body: JSON.stringify({ error: "Failed to open stripe Client" }) };
        }
    
        const stripeData = await getStripe(org.Item.stripe_id)

        return { 
            statusCode: 200, 
            body: JSON.stringify({ 
            organization: { 
                date_registered: org.Item.date_registered,
                name: org.Item.name,
                logo: org.Item.images.logo.url,
                active: org.Item.active,
                billingData:stripeData.value,
            }
        })};

    } catch (error) {
        console.error("Error fetching Billing:", error);
        return { statusCode: 500, body: JSON.stringify({ error:'Error fetching Billing' }) };
    }
};
