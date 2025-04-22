import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import Stripe from 'stripe';
import { handler } from '@/lambda/organization/getBilling';
import { getStripeSecret } from '@/lambda/constants/validOrganization';

jest.mock('@/lambda/constants/validOrganization', () => ({
    getStripeSecret: jest.fn(),
}));

jest.mock('stripe', () => {
    const mockStripeInstance = {
        customers: {
            listPaymentMethods: jest.fn(),
            retrieve: jest.fn(),
        },
        subscriptions: {
            list: jest.fn(),
        },
        invoices: {
            createPreview: jest.fn(),
            list: jest.fn(),
        },
    };

    const MockStripe = jest.fn(() => mockStripeInstance);

    MockStripe.mockImplementation(() => mockStripeInstance);

    return {
        __esModule: true,
        default: MockStripe
    };
});

const ddbMock = mockClient(DynamoDBDocumentClient);

const createMockEvent = (userSub?: string): APIGatewayProxyEvent => {
    const claims: Record<string, any> = {};

    if (userSub) {
        claims.sub = userSub;
    }

    return {
        body: null,
        headers: {},
        httpMethod: "",
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
        path: "",
        pathParameters: null,
        queryStringParameters: null,
        resource: "",
        stageVariables: null,
        requestContext: {
            authorizer: {
                claims
            },
            accountId: '',
            apiId: '',
            protocol: '',
            httpMethod: '',
            identity: {} as any,
            path: '',
            stage: '',
            requestId: '',
            resourceId: '',
            resourcePath: '',
            requestTimeEpoch: 0
        }
    };
};


describe('getBilling Lambda', () => {
    const eventWithUser = createMockEvent('test-user-id');
    const eventWithOutUser = createMockEvent();

    const mockStripeKey = 'mock-stripe-key';
    const mockOrgId = 'test-org-id';
    const mockStripeId = 'stripe-customer-id';

    beforeEach(() => {
        process.env.ORG_TABLE = 'organizations';
        process.env.USER_TABLE = 'users';
        process.env.STRIPE_ARN = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test/stripe/key';

        (getStripeSecret as jest.Mock).mockReset();
        (getStripeSecret as jest.Mock).mockImplementation(() => Promise.resolve(mockStripeKey));
    });

    afterEach(()=>{
        jest.clearAllMocks();
        ddbMock.reset();
    })

    test('should return 404 when Stripe secret retrieval fails', async () => {
        (getStripeSecret as jest.Mock).mockReset();

        ddbMock.on(GetCommand, {
            TableName: 'users',
            Key: { id: 'test-user-id' },
        }).resolves({
            Item: {
                org_id: mockOrgId,
                permissions: ['admin']
            }
        });

        ddbMock.on(GetCommand, {
            TableName: 'organizations',
            Key: { id: mockOrgId },
        }).resolves({
            Item: {
                id: mockOrgId,
                stripe_id: mockStripeId,
                linked: true,
                name: 'Test Organization',
                images: { logo: { url: 'https://example.com/logo.png' } },
                date_registered: '2023-01-01',
                active: true
            }
        });

        (getStripeSecret as jest.Mock).mockImplementation(() => Promise.resolve(null));

        const response = await handler(eventWithUser);

        expect(response.statusCode).toBe(404);
        expect(JSON.parse(response.body).error).toBe('Failed to retrieve Stripe secret key');
    });

    test('should return 200 and organization details with active subscription', async () => {
        ddbMock.on(GetCommand, {
            TableName: 'users',
            Key: { id: 'test-user-id' },
        }).resolves({
            Item: {
                org_id: mockOrgId,
                permissions: ['admin']
            }
        });

        ddbMock.on(GetCommand, {
            TableName: 'organizations',
            Key: { id: mockOrgId },
        }).resolves({
            Item: {
                id: mockOrgId,
                stripe_id: mockStripeId,
                linked: true,
                name: 'Test Organization',
                images: { logo: { url: 'https://example.com/logo.png' } },
                date_registered: '2023-01-01',
                active: true
            }
        });

        const stripeMock = new Stripe(mockStripeKey) as jest.Mocked<Stripe>;

        (stripeMock.customers.listPaymentMethods as jest.Mock).mockResolvedValue({
            data: [
                { id: 'pm_123', card: { brand: 'visa', last4: '4242' } }
            ]
        });

        (stripeMock.customers.retrieve as jest.Mock).mockResolvedValue({
            id: mockStripeId,
            deleted: false,
            invoice_settings: {
                default_payment_method: 'pm_123'
            }
        });

        (stripeMock.subscriptions.list as jest.Mock).mockResolvedValue({
            data: [
                {
                    id: 'sub_123',
                    items: {
                        data:[{
                            current_period_start: 1672531200,
                            current_period_end: 1675209600,
                        }]
                    }
                }
            ]
        });

        (stripeMock.invoices.createPreview as jest.Mock).mockResolvedValue({
            total: 2000,
            amount_due: 2000,
            total_excluding_tax: 1800,
            tax: 200,
            created: 1672531200,
            period_start: 1672531200,
            period_end: 1675209600,
        });

        (stripeMock.invoices.list as jest.Mock).mockResolvedValue({
            data: [
                {
                    id: 'in_123',
                    total: 2000,
                    amount_due: 0,
                    created: 1669939200,
                    period_start: 1669939200,
                    period_end: 1672531200,
                    invoice_pdf: 'https://example.com/invoice.pdf',
                    paid: true,
                }
            ]
        });

        const response = await handler(eventWithUser);

        expect(response.statusCode).toBe(200);

        const body = JSON.parse(response.body);
        expect(body.organization).toBeDefined();
        expect(body.organization.name).toBe('Test Organization');
        expect(body.organization.logo).toBe('https://example.com/logo.png');
        expect(body.organization.active).toBe(true);
        expect(body.organization.billingData).toBeDefined();
        expect(body.organization.billingData.active).toBe(true);
        expect(body.organization.billingData.currPaymentMethod).toBe('pm_123');
        expect(body.organization.billingData.invoices.length).toBe(2);
        expect(body.organization.billingData.paymentMethods.length).toBe(1);
    });

    test('should return 200 with inactive subscription when no subscriptions exist', async () => {
        ddbMock.on(GetCommand, {
            TableName: 'users',
            Key: { id: 'test-user-id' },
        }).resolves({
            Item: {
                org_id: mockOrgId,
                permissions: ['admin']
            }
        });

        ddbMock.on(GetCommand, {
            TableName: 'organizations',
            Key: { id: mockOrgId },
        }).resolves({
            Item: {
                id: mockOrgId,
                stripe_id: mockStripeId,
                linked: true,
                name: 'Test Organization',
                images: { logo: { url: 'https://example.com/logo.png' } },
                date_registered: '2023-01-01',
                active: true
            }
        });

        const stripeMock = new Stripe(mockStripeKey) as jest.Mocked<Stripe>;

        (stripeMock.customers.listPaymentMethods as jest.Mock).mockResolvedValue({
            data: [
                { id: 'pm_123', card: { brand: 'visa', last4: '4242' } }
            ]
        });

        (stripeMock.customers.retrieve as jest.Mock).mockResolvedValue({
            id: mockStripeId,
            deleted: false,
            invoice_settings: {
                default_payment_method: 'pm_123'
            }
        });

        (stripeMock.subscriptions.list as jest.Mock).mockResolvedValue({
            data: []
        });

        const response = await handler(eventWithUser );

        expect(response.statusCode).toBe(200);

        const body = JSON.parse(response.body);
        expect(body.organization.billingData.active).toBe(false);
        expect(body.organization.billingData.total).toBe(0);
        expect(body.organization.billingData.tax).toBe(0);
        expect(body.organization.billingData.paymentWindow.start).toBe(null);
        expect(body.organization.billingData.paymentWindow.end).toBe(null);
        expect(body.organization.billingData.invoices).toEqual([]);
    });

    test('should return 401 when no user ID is provided', async () => {

        const response = await handler(eventWithOutUser );

        expect(response.statusCode).toBe(401);
        expect(JSON.parse(response.body).error).toBe('no userID supplied');
    });

    test('should return 210 when user has no associated organization', async () => {
        ddbMock.on(GetCommand, {
            TableName: 'users',
            Key: { id: 'test-user-id' },
        }).resolves({
            Item: {
                permissions: ['admin']
            }
        });

        const response = await handler(eventWithUser );

        expect(response.statusCode).toBe(210);
        expect(JSON.parse(response.body).info).toBe('Organization not Found');
    });

    test('should return 210 when organization is not found', async () => {
        ddbMock.on(GetCommand, {
            TableName: 'users',
            Key: { id: 'test-user-id' },
        }).resolves({
            Item: {
                org_id: mockOrgId,
                permissions: ['admin']
            }
        });

        ddbMock.on(GetCommand, {
            TableName: 'organizations',
            Key: { id: mockOrgId },
        }).resolves({});

        const response = await handler(eventWithUser );

        expect(response.statusCode).toBe(210);
        expect(JSON.parse(response.body).info).toBe('Organization not found');
    });

    test('should return 211 when organization is not linked', async () => {
        ddbMock.on(GetCommand, {
            TableName: 'users',
            Key: { id: 'test-user-id' },
        }).resolves({
            Item: {
                org_id: mockOrgId,
                permissions: ['admin']
            }
        });

        ddbMock.on(GetCommand, {
            TableName: 'organizations',
            Key: { id: mockOrgId },
        }).resolves({
            Item: {
                id: mockOrgId,
                stripe_id: mockStripeId,
                linked: false,
                name: 'Test Organization',
                images: { logo: { url: 'https://example.com/logo.png' } },
                date_registered: '2023-01-01',
                active: true
            }
        });

        const response = await handler(eventWithUser );

        expect(response.statusCode).toBe(211);
        expect(JSON.parse(response.body).info).toBe('Organization not Linked');
    });

    test('should handle Stripe API errors gracefully', async () => {
        ddbMock.on(GetCommand, {
            TableName: 'users',
            Key: { id: 'test-user-id' },
        }).resolves({
            Item: {
                org_id: mockOrgId,
                permissions: ['admin']
            }
        });

        ddbMock.on(GetCommand, {
            TableName: 'organizations',
            Key: { id: mockOrgId },
        }).resolves({
            Item: {
                id: mockOrgId,
                stripe_id: mockStripeId,
                linked: true,
                name: 'Test Organization',
                images: { logo: { url: 'https://example.com/logo.png' } },
                date_registered: '2023-01-01',
                active: true
            }
        });

        const stripeMock = new Stripe(mockStripeKey) as jest.Mocked<Stripe>;

        (stripeMock.customers.listPaymentMethods as jest.Mock).mockRejectedValue(
            new Error('Stripe API error')
        );

        const response = await handler(eventWithUser);

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.organization.billingData).toBe(null);
    });

    test('should return 500 when environment variables are missing', async () => {
        delete process.env.ORG_TABLE;

        const response = await handler(eventWithUser);

        expect(response.statusCode).toBe(500);
        expect(JSON.parse(response.body).error).toBe('No Org/User Table');
    });

    test('should handle unexpected errors and log them properly', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        ddbMock.on(GetCommand, {
            TableName: 'users',
            Key: { id: 'test-user-id' },
        }).resolves({
            Item: {
                org_id: mockOrgId,
                permissions: ['admin']
            }
        });

        ddbMock.on(GetCommand, {
            TableName: 'organizations',
            Key: { id: mockOrgId },
        }).rejects(new Error('Unexpected DynamoDB error'));

        (getStripeSecret as jest.Mock).mockResolvedValue(mockStripeKey);

        const mockError = new Error('Unexpected DynamoDB error');
        const stripeMock = jest.requireMock('stripe').default;
        stripeMock.mockImplementation(() => {
            throw mockError;
        });

        const response = await handler(eventWithUser);

        expect(response.statusCode).toBe(500);
        expect(JSON.parse(response.body)).toEqual({
            error: 'Error fetching Billing'
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching Billing:', mockError);

        consoleErrorSpy.mockRestore();
    });
});