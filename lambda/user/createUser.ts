import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { PostConfirmationTriggerEvent } from 'aws-lambda';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);
const ses = new SESClient({ region: 'us-east-1' }); 

exports.handler = async (event:PostConfirmationTriggerEvent) => {
  const tableName = process.env.TABLE;
  const role = process.env.ROLE;
  const emailSender = process.env.EMAIL_SENDER;

    try {
        const { request: { userAttributes } } = event;
        let credentials = {
            modifyPlans:true,
            modifyPayments:true,
        };
        
        if (!userAttributes.email || !userAttributes.given_name || !userAttributes.family_name || !userAttributes.sub || !role || !tableName) {
        console.error('Missing required attributes');
        throw new Error('Missing required attributes');
        }

        // look for invites
        
        const userData = {
            id: userAttributes.sub,
            email: userAttributes.email,
            birthdate: userAttributes.birthdate ? new Date(userAttributes.birthdate).toISOString() : null,
            fullname: {
                firstName: userAttributes.given_name,
                lastName: userAttributes.family_name
            },
            date_created: new Date().toISOString(),
            role:role,
            credentials,
            newAccount: true,
            preferences:{
                lightMode:true
            }
        };

        const params = {
            TableName: tableName,
            Item: userData,
            ConditionExpression: 'attribute_not_exists(id)'
        };

        const emailHtmlPath = resolve(__dirname, 'EmailTemplate', 'welcome-email-customer.html');
        const emailHtmlContent = readFileSync(emailHtmlPath, 'utf-8');

        const emailParams = {
            Source: `MyRewards <${emailSender}>`,
            Destination: { ToAddresses: [userAttributes.email] },
            Message: {
                Subject: { Data: 'Welcome To MyRewards!' },
                Body: {
                    Html: { Data: emailHtmlContent },
                    Text: { Data: 'Setup your account and link with Square if you haven’t! We have a feeling you’re going to like it here.' },
                },
            },
        };

        await dynamoDb.send(new PutCommand(params));

        await ses.send(new SendEmailCommand(emailParams));

        return event;
        
    } catch (error) {
        console.error('Error creating User:', error);
        throw error;
    }
};