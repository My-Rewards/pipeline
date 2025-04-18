import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { mockClient } from 'aws-sdk-client-mock';
import { PostConfirmationTriggerEvent } from 'aws-lambda';
import { handler } from '@/lambda/user/createUser';

// Create mocks
const ddbMock = mockClient(DynamoDBDocumentClient);
const sesMock = mockClient(SESClient);

// Setup test environment variables
process.env.TABLE = 'test-users-table';
process.env.EMAIL_SENDER = 'noreply@example.com';
process.env.EMAIL = '<p>Welcome to MyRewards!</p>';

describe('createUser Lambda', () => {
    beforeEach(() => {
        // Reset mocks before each test
        ddbMock.reset();
        sesMock.reset();

        // Set up default mock behavior
        ddbMock.on(GetCommand).resolves({});
        ddbMock.on(PutCommand).resolves({});
        sesMock.on(SendEmailCommand).resolves({});
    });

    // Helper function to create mock Cognito event
    function createMockEvent(userAttributes: any): PostConfirmationTriggerEvent {
        return {
            version: '1',
            region: 'us-east-1',
            userPoolId: 'us-east-1_testpool',
            userName: 'testuser',
            callerContext: {
                awsSdkVersion: 'aws-sdk-js-v3',
                clientId: 'test-client-id'
            },
            triggerSource: 'PostConfirmation_ConfirmSignUp',
            request: {
                userAttributes
            },
            response: {}
        } as PostConfirmationTriggerEvent;
    }

    test('should create a new user successfully', async () => {
        // Setup mock event with user attributes
        const mockEvent = createMockEvent({
            sub: 'user123',
            email: 'user@example.com',
            given_name: 'John',
            family_name: 'Doe',
            birthdate: '1990-01-01'
        });

        // User doesn't exist yet
        ddbMock.on(GetCommand, {
            TableName: 'test-users-table',
            Key: { id: 'user123' }
        }).resolves({Item: undefined});

        // Execute handler
        const result = await handler(mockEvent);

        // Verify result is the same event
        expect(result).toEqual(mockEvent);

        // Verify DynamoDB calls
        const getCalls = ddbMock.commandCalls(GetCommand);
        expect(getCalls.length).toBe(1);
        expect(getCalls[0].args[0].input).toEqual({
            TableName: 'test-users-table',
            Key: { id: 'user123' }
        });

        const putCalls = ddbMock.commandCalls(PutCommand);
        expect(putCalls.length).toBe(1);

        const putParams = putCalls[0].args[0].input;
        expect(putParams.TableName).toBe('test-users-table');
        expect(putParams.Item).toEqual({
            id: 'user123',
            email: 'user@example.com',
            birthdate: '1990-01-01T00:00:00.000Z',
            fullname: {
                firstName: 'John',
                lastName: 'Doe'
            },
            date_created: expect.any(String),
            newAccount: true,
            preferences: {
                lightMode: true
            }
        });
        expect(putParams.ConditionExpression).toBe('attribute_not_exists(id)');

        // Verify SES call
        const sesCalls = sesMock.commandCalls(SendEmailCommand);
        expect(sesCalls.length).toBe(1);

        const emailParams = sesCalls[0].args[0].input;
        expect(emailParams.Source).toBe('MyRewards <noreply@example.com>');
        expect(emailParams.Destination?.ToAddresses).toEqual(['user@example.com']);

    });

    test('should handle null birthdate correctly', async () => {
        const mockEvent = createMockEvent({
            sub: 'user456',
            email: 'user2@example.com',
            given_name: 'Jane',
            family_name: 'Smith',
            // No birthdate provided
        });

        ddbMock.on(GetCommand).resolves({ Item: undefined });

        await handler(mockEvent);

        const putCalls = ddbMock.commandCalls(PutCommand);
        expect(putCalls.length).toBe(1);

        const userData = putCalls[0].args[0].input.Item;
        expect(userData?.birthdate).toBeNull();
    });

    test('should skip creation if user already exists from GetCommand', async () => {
        const mockEvent = createMockEvent({
            sub: 'existingUser',
            email: 'existing@example.com',
            given_name: 'Existing',
            family_name: 'User'
        });

        // Mock that user already exists
        ddbMock.on(GetCommand).resolves({
            Item: {
                id: 'existingUser',
                email: 'existing@example.com'
            }
        });

        const result = await handler(mockEvent);

        // Verify result is the same event
        expect(result).toEqual(mockEvent);

        // Verify no PutCommand or SendEmailCommand were called
        const putCalls = ddbMock.commandCalls(PutCommand);
        expect(putCalls.length).toBe(0);

        const sesCalls = sesMock.commandCalls(SendEmailCommand);
        expect(sesCalls.length).toBe(0);
    });

    test('should skip creation if PutCommand fails with ConditionalCheckFailedException', async () => {
        const mockEvent = createMockEvent({
            sub: 'user789',
            email: 'user3@example.com',
            given_name: 'Alice',
            family_name: 'Johnson'
        });

        // GetCommand shows user doesn't exist
        ddbMock.on(GetCommand).resolves({ Item: undefined });

        // PutCommand fails due to condition check (user already exists)
        const conditionalError = {
            name: 'ConditionalCheckFailedException',
            message: 'The conditional request failed'
        };
        ddbMock.on(PutCommand).rejects(conditionalError);

        const result = await handler(mockEvent);

        // Verify result is the same event
        expect(result).toEqual(mockEvent);

        // Verify PutCommand was called
        const putCalls = ddbMock.commandCalls(PutCommand);
        expect(putCalls.length).toBe(1);

        // Verify SendEmailCommand was not called
        const sesCalls = sesMock.commandCalls(SendEmailCommand);
        expect(sesCalls.length).toBe(0);
    });

    test('should throw error if missing required attributes', async () => {
        const mockEvent = createMockEvent({
            sub: 'user123',
            // Missing email
            given_name: 'John',
            family_name: 'Doe'
        });

        await expect(handler(mockEvent)).rejects.toThrow('Missing required attributes');
    });

    test('should throw error if DynamoDB put fails with non-conditional error', async () => {
        const mockEvent = createMockEvent({
            sub: 'user123',
            email: 'user@example.com',
            given_name: 'John',
            family_name: 'Doe'
        });

        // GetCommand shows user doesn't exist
        ddbMock.on(GetCommand).resolves({ Item: undefined });

        // PutCommand fails with a non-conditional error
        const dbError = new Error('Internal DynamoDB error');
        ddbMock.on(PutCommand).rejects(dbError);

        await expect(handler(mockEvent)).rejects.toThrow('Internal DynamoDB error');
    });

    test('should throw error if SES send fails', async () => {
        const mockEvent = createMockEvent({
            sub: 'user123',
            email: 'user@example.com',
            given_name: 'John',
            family_name: 'Doe'
        });

        // GetCommand shows user doesn't exist
        ddbMock.on(GetCommand).resolves({ Item: undefined});

        // PutCommand succeeds
        ddbMock.on(PutCommand).resolves({});

        // SendEmailCommand fails
        const sesError = new Error('SES error');
        sesMock.on(SendEmailCommand).rejects(sesError);

        await expect(handler(mockEvent)).rejects.toThrow('SES error');
    });
});