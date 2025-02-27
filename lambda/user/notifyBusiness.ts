import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { PostAuthenticationTriggerEvent } from 'aws-lambda';

const ses = new SESClient({ region: 'us-east-1' }); 

exports.handler = async (event:PostAuthenticationTriggerEvent) => {
  const emailSender = process.env.EMAIL_SENDER;

    try {
        
        if (!event.request.userAttributes.email) {
            console.error('Missing required attributes');
            throw new Error('Missing required attributes');
        }

        const emailParams = {
            Source: emailSender,
            Destination: { ToAddresses: [event.request.userAttributes.email] },
            Message: {
                Subject: { Data: 'Welcome To MyRewards!' },
                Body: { Text: { Data: 'Setup Your account and link with square if you havent! We have a feeling your gonna like it here.' } },
            },
        };

        await ses.send(new SendEmailCommand(emailParams));

        return event;
        
    } catch (error) {        
        
        console.error('Error creating User:', error);
        throw error;
    }
};