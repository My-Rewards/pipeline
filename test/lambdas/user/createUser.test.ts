import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { PostConfirmationTriggerEvent } from 'aws-lambda';
import * as fs from 'fs';
import { handler } from '../../../lambda/user/createUser';

const ddbMock = mockClient(DynamoDBDocumentClient);
const sesMock = mockClient(SESClient);

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    readFileSync: jest.fn(),
}));

describe('createUser Lambda Function', () => {
    const mockEvent: PostConfirmationTriggerEvent = {
        version: '1',
        region: 'us-east-1',
        userPoolId: 'us-east-1_example',
        userName: 'testuser',
        callerContext: {
            awsSdkVersion: 'aws-sdk-js-2.1.0',
            clientId: 'client-id',
        },
        triggerSource: 'PostConfirmation_ConfirmSignUp',
        request: {
            userAttributes: {
                sub: 'abc-123-def-456',
                email: 'test@example.com',
                email_verified: 'true',
                given_name: 'John',
                family_name: 'Doe',
                birthdate: '1990-01-01',
            },
        },
        response: {},
    };

    const mockEmailTemplate = '<html><body>Welcome!</body></html>';

    beforeEach(() => {
        ddbMock.reset();
        sesMock.reset();
        jest.clearAllMocks();

        process.env.TABLE = 'UsersTable';
        process.env.EMAIL_SENDER = 'no-reply@example.com';
        process.env.EMAIL = '<html><body>Welcome!</body></html>';

        (fs.readFileSync as jest.Mock).mockReturnValue(mockEmailTemplate);
    });

    it('should successfully create a user and send welcome email', async () => {
        ddbMock.on(PutCommand).resolves({});
        sesMock.on(SendEmailCommand).resolves({});

        const result = await handler(mockEvent);

        const putCommandCalls = ddbMock.commandCalls(PutCommand);
        expect(putCommandCalls.length).toBe(1);

        const putParams = putCommandCalls[0].args[0].input;
        expect(putParams.TableName).toBe('UsersTable');
        expect(putParams.Item).toEqual(expect.objectContaining({
            id: 'abc-123-def-456',
            email: 'test@example.com',
            fullname: {
                firstName: 'John',
                lastName: 'Doe'
            },
            birthdate: expect.any(String),
            credentials: {
                modifyPlans: true,
                modifyPayments: true,
            },
            newAccount: true,
            preferences: {
                lightMode: true
            }
        }));
        expect(putParams.ConditionExpression).toBe('attribute_not_exists(id)');

        const sendEmailCalls = sesMock.commandCalls(SendEmailCommand);
        expect(sendEmailCalls.length).toBe(1);

        const emailParams = sendEmailCalls[0].args[0].input;
        expect(emailParams.Source).toBe('MyRewards <no-reply@example.com>');

        expect(emailParams.Destination).toBeDefined();
        if (emailParams.Destination) {
            expect(emailParams.Destination.ToAddresses).toEqual(['test@example.com']);
        }

        expect(emailParams.Message).toBeDefined();
        if (emailParams.Message) {
            expect(emailParams.Message.Subject).toBeDefined();
            if (emailParams.Message.Subject) {
                expect(emailParams.Message.Subject.Data).toBe('Welcome To MyRewards!');
            }

            expect(emailParams.Message.Body).toBeDefined();
            if (emailParams.Message.Body) {
                expect(emailParams.Message.Body.Html).toBeDefined();
                if (emailParams.Message.Body.Html) {
                    expect(emailParams.Message.Body.Html.Data).toBe(mockEmailTemplate);
                }
            }
        }

        expect(result).toEqual(mockEvent);
    });

    it('should handle missing user attributes correctly', async () => {
        const incompleteEvent = {
            ...mockEvent,
            request: {
                userAttributes: {
                    sub: 'abc-123-def-456',
                    email: 'test@example.com',
                }
            }
        };

        await expect(handler(incompleteEvent)).rejects.toThrow('Missing required attributes');

        expect(ddbMock.commandCalls(PutCommand).length).toBe(0);
        expect(sesMock.commandCalls(SendEmailCommand).length).toBe(0);
    });

    it('should handle missing environment variables correctly', async () => {
        delete process.env.TABLE;

        await expect(handler(mockEvent)).rejects.toThrow('Missing required attributes');

        expect(ddbMock.commandCalls(PutCommand).length).toBe(0);
        expect(sesMock.commandCalls(SendEmailCommand).length).toBe(0);
    });

    it('should handle DynamoDB errors correctly', async () => {
        const dbError = new Error('DynamoDB error');
        ddbMock.on(PutCommand).rejects(dbError);

        await expect(handler(mockEvent)).rejects.toThrow(dbError);

        expect(ddbMock.commandCalls(PutCommand).length).toBe(1);
        expect(sesMock.commandCalls(SendEmailCommand).length).toBe(0);
    });

    it('should handle null birthdate correctly', async () => {
        const noBirthdateEvent:PostConfirmationTriggerEvent = {
            ...mockEvent,
            request: {
                userAttributes: {
                    ...mockEvent.request.userAttributes,
                    birthdate: null as unknown as string
                }
            }
        };

        ddbMock.on(PutCommand).resolves({});
        sesMock.on(SendEmailCommand).resolves({});

        await handler(noBirthdateEvent);

        const putCommandCalls = ddbMock.commandCalls(PutCommand);
        expect(putCommandCalls.length).toBeGreaterThan(0);
        const firstCall = putCommandCalls[0];
        expect(firstCall).toBeDefined();
        expect(firstCall.args.length).toBeGreaterThan(0);
        expect(firstCall.args[0].input).toBeDefined();
        expect(firstCall.args[0].input.Item).toBeDefined();
    });

    it('should handle SES errors correctly', async () => {
        ddbMock.on(PutCommand).resolves({});
        const sesError = new Error('SES error');
        sesMock.on(SendEmailCommand).rejects(sesError);

        await expect(handler(mockEvent)).rejects.toThrow(sesError);

        expect(ddbMock.commandCalls(PutCommand).length).toBe(1);
        expect(sesMock.commandCalls(SendEmailCommand).length).toBe(1);
    });
});