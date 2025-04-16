import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../lambda/organization/getOrg'; // Update with actual path

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('GetOrg Lambda Function', () => {
    beforeEach(() => {
        ddbMock.reset();

        process.env.ORG_TABLE = 'test-org-table';
        process.env.SHOP_TABLE = 'test-shop-table';
        process.env.USER_TABLE = 'test-user-table';
    });

    const createMockEvent = (userSub: string | null = '123456789'): APIGatewayProxyEvent => {
        return {
            requestContext: {
                accountId: '',
                apiId: '',
                authorizer: {
                    claims: {
                        sub: userSub
                    }
                },
                stage: '',
                requestId: '',
                resourceId: '',
                identity: {
                    accessKey: null,
                    accountId: null,
                    apiKey: null,
                    apiKeyId: null,
                    caller: null,
                    clientCert: null,
                    cognitoAuthenticationProvider: null,
                    cognitoAuthenticationType: null,
                    cognitoIdentityId: null,
                    cognitoIdentityPoolId: null,
                    principalOrgId: null,
                    sourceIp: '',
                    user: null,
                    userAgent: null,
                    userArn: null
                },
                path: '',
                protocol: '',
                domainName: '',
                httpMethod: 'GET',
                requestTimeEpoch: 0,
                resourcePath: ''
            },
            body: '',
            headers: {},
            multiValueHeaders: {},
            httpMethod: 'GET',
            isBase64Encoded: false,
            path: '/',
            pathParameters: null,
            queryStringParameters: null,
            multiValueQueryStringParameters: null,
            stageVariables: null,
            resource: ''
        } as unknown as APIGatewayProxyEvent;
    };

    test('should return 500 when org table is missing', async () => {
        delete process.env.ORG_TABLE;
        const event = createMockEvent();

        const response = await handler(event);

        expect(response.statusCode).toBe(500);
        expect(JSON.parse(response.body)).toEqual({ error: 'No Org/Shop Table' });
    });

    test('should return 500 when shop table is missing', async () => {
        delete process.env.SHOP_TABLE;
        const event = createMockEvent();

        const response = await handler(event);

        expect(response.statusCode).toBe(500);
        expect(JSON.parse(response.body)).toEqual({ error: 'No Org/Shop Table' });
    });

    test('should return 404 when user sub is missing', async () => {
        const event = createMockEvent(null);

        const response = await handler(event);

        expect(response.statusCode).toBe(404);
        expect(JSON.parse(response.body)).toEqual({ error: 'no userID supplied' });
    });

    test('should return 210 when user not found or has no orgId', async () => {
        const event = createMockEvent();
        ddbMock.on(GetCommand).resolves({ Item: undefined });

        const response = await handler(event);

        expect(response.statusCode).toBe(210);
        expect(JSON.parse(response.body)).toEqual({ info: 'Organization not Found' });
    });

    test('should return 210 when organization not found', async () => {
        const event = createMockEvent();

        ddbMock.on(GetCommand, {
            TableName: 'test-user-table',
            Key: { id: '123456789' }
        }).resolves({
            Item: {
                orgId: 'org-123',
                permissions: ['read']
            }
        });

        ddbMock.on(GetCommand, {
            TableName: 'test-org-table',
            Key: { id: 'org-123' }
        }).resolves({
            Item: undefined
        });

        const response = await handler(event);

        expect(response.statusCode).toBe(210);
        expect(JSON.parse(response.body)).toEqual({ info: 'Organization not found' });
    });

    test('should return 211 when organization is not linked', async () => {
        const event = createMockEvent();

        ddbMock.on(GetCommand, {
            TableName: 'test-user-table',
            Key: { id: '123456789' }
        }).resolves({
            Item: {
                orgId: 'org-123',
                permissions: ['read']
            }
        });

        ddbMock.on(GetCommand, {
            TableName: 'test-org-table',
            Key: { id: 'org-123' }
        }).resolves({
            Item: {
                id: 'org-123',
                name: 'Test Org',
                linked: false
            }
        });

        const response = await handler(event);

        expect(response.statusCode).toBe(211);
        expect(JSON.parse(response.body)).toEqual({ info: 'Organization not Linked' });
    });

    test('should return 212 when shops not found', async () => {
        const event = createMockEvent();

        ddbMock.on(GetCommand, {
            TableName: 'test-user-table'
        }).resolves({
            Item: {
                orgId: 'org-123',
                permissions: ['read']
            }
        });

        // Mock org retrieval
        ddbMock.on(GetCommand, {
            TableName: 'test-org-table'
        }).resolves({
            Item: {
                id: 'org-123',
                name: 'Test Org',
                linked: true,
                description: 'Test Description',
                images: ['img1.jpg'],
                date_registered: '2023-01-01',
                rewards_loyalty: true,
                rewards_milestone: false,
                rl_active: true,
                rm_active: false,
                active: true
            }
        });

        ddbMock.on(QueryCommand).resolves({ Items: undefined });

        const response = await handler(event);

        expect(response.statusCode).toBe(212);
        expect(JSON.parse(response.body)).toEqual({ info: 'Error Fetching Shops' });
    });

    test('should return 200 with organization and shops data when successful', async () => {
        const event = createMockEvent();

        const mockOrg = {
            id: 'org-123',
            name: 'Test Org',
            linked: true,
            description: 'Test Description',
            images: {
                logo:{
                    url:'test.com/logo',
                    fileKey:'path'
                },
                preview:{
                    url:'test.com/preview',
                    fileKey:'path'
                },
                banner:{
                    url:'test.com/banner',
                    fileKey:'path'
                }
            },
            date_registered: '2023-01-01',
            rewards_loyalty: true,
            rewards_milestone: false,
            rl_active: true,
            rm_active: false,
            active: true
        };

        const mockShops = [
            {
                id: 'shop-1',
                name: 'Shop 1',
                orgId: 'org-123'
            },
            {
                id: 'shop-2',
                name: 'Shop 2',
                orgId: 'org-123'
            }
        ];

        ddbMock.on(GetCommand, {
            TableName: 'test-user-table'
        }).resolves({
            Item: {
                orgId: 'org-123',
                permissions: ['read']
            }
        });

        ddbMock.on(GetCommand, {
            TableName: 'test-org-table'
        }).resolves({
            Item: mockOrg
        });

        ddbMock.on(QueryCommand).resolves({ Items: mockShops });

        const response = await handler(event);

        expect(response.statusCode).toBe(200);

        const responseBody = JSON.parse(response.body);
        expect(responseBody.organization).toBeDefined();
        expect(responseBody.organization.name).toBe('Test Org');
        expect(responseBody.organization.description).toBe('Test Description');
        expect(responseBody.organization.shops).toHaveLength(2);
        expect(responseBody.organization.shops[0].id).toBe('shop-1');
        expect(responseBody.organization.shops[1].id).toBe('shop-2');
        expect(responseBody.organization.paymentSetup).toBe(false);
    });

    test('should return 501 when an error occurs', async () => {
        const event = createMockEvent();
        ddbMock.on(GetCommand).rejects(new Error('Database error'));

        const response = await handler(event);

        expect(response.statusCode).toBe(501);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.info).toBe('Something went wrong');
    });
});