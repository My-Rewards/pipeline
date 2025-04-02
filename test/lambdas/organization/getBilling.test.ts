import { handler } from '../../../lambda/organization/getBilling';
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import Stripe from "stripe";

const ddbMock = mockClient(DynamoDBDocumentClient);
const secretsMock = mockClient(SecretsManagerClient);

jest.mock("stripe");
const mockStripe = Stripe as jest.MockedClass<typeof Stripe>;

process.env.ORG_TABLE = "test-org-table";
process.env.USER_TABLE = "test-user-table";
process.env.STRIPE_ARN = "test-stripe-arn";

describe("getBilling Lambda Handler", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        ddbMock.reset();
        secretsMock.reset();

        secretsMock.on(GetSecretValueCommand).resolves({
            SecretString: JSON.stringify({ secretKey: "mock-stripe-key" }),
        });
    });

    test("should return 500 if org table or user table is not defined", async () => {
        process.env.ORG_TABLE = "";

        const result = await handler({
            requestContext: {
                authorizer: {
                    claims: { sub: "user123" }
                }
            }
        } as any);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toEqual({ error: "No Org/User Table" });

        process.env.ORG_TABLE = "test-org-table";
    });

    test("should return 401 if userSub is not provided", async () => {
        const result = await handler({
            requestContext: {
                authorizer: { claims: {} }
            }
        } as any);

        expect(result.statusCode).toBe(401);
        expect(JSON.parse(result.body)).toEqual({ error: "no userID supplied" });
    });

    test("should return 404 if Stripe ARN is not defined", async () => {
        process.env.STRIPE_ARN = "";

        const result = await handler({
            requestContext: {
                authorizer: {
                    claims: { sub: "user123" }
                }
            }
        } as any);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toEqual({ error: "Missing Stripe Arn" });

        process.env.STRIPE_ARN = "test-stripe-arn";
    });

    test("should return 210 if user's orgId is not found", async () => {
        ddbMock.on(GetCommand, {
            TableName: "test-user-table",
            Key: { id: "user123" }
        }).resolves({
            Item: { }
        });

        const result = await handler({
            requestContext: {
                authorizer: {
                    claims: { sub: "user123" }
                }
            }
        } as any);

        expect(result.statusCode).toBe(210);
        expect(JSON.parse(result.body)).toEqual({ info: "Organization not Found" });
    });

    test("should return 210 if organization is not found", async () => {
        ddbMock.on(GetCommand, {
            TableName: "test-user-table",
            Key: { id: "user123" }
        }).resolves({
            Item: {
                orgId: "org123",
                permissions: ["read", "write"]
            }
        });

        ddbMock.on(GetCommand, {
            TableName: "test-org-table",
            Key: { id: "org123" }
        }).resolves({
            Item: undefined
        });

        const result = await handler({
            requestContext: {
                authorizer: {
                    claims: { sub: "user123" }
                }
            }
        } as any);

        expect(result.statusCode).toBe(210);
        expect(JSON.parse(result.body)).toEqual({ info: "Organization not found" });
    });

    test("should return 211 if organization is not linked", async () => {
        ddbMock.on(GetCommand, {
            TableName: "test-user-table",
            Key: { id: "user123" }
        }).resolves({
            Item: {
                orgId: "org123",
                permissions: ["read", "write"]
            }
        });

        ddbMock.on(GetCommand, {
            TableName: "test-org-table",
            Key: { id: "org123" }
        }).resolves({
            Item: {
                id: "org123",
                linked: false,
                name: "Test Org",
                images: { logo: "logo-url" },
                date_registered: "2023-01-01"
            }
        });

        const result = await handler({
            requestContext: {
                authorizer: {
                    claims: { sub: "user123" }
                }
            }
        } as any);

        expect(result.statusCode).toBe(211);
        expect(JSON.parse(result.body)).toEqual({ info: "Organization not Linked" });
    });

    test("should successfully return billing data for a linked organization", async () => {
        ddbMock.on(GetCommand, {
            TableName: "test-user-table",
            Key: { id: "user123" }
        }).resolves({
            Item: {
                orgId: "org123",
                permissions: ["read", "write"]
            }
        });

        // Setup organization data
        ddbMock.on(GetCommand, {
            TableName: "test-org-table",
            Key: { id: "org123" }
        }).resolves({
            Item: {
                id: "org123",
                linked: true,
                name: "Test Org",
                stripe_id: "cus_123456",
                images: { logo: "logo-url" },
                date_registered: "2023-01-01"
            }
        });

        const mockStripeInstance = {
            customers: {
                listPaymentMethods: jest.fn().mockResolvedValue({
                    data: [{ id: "pm_123", card: { last4: "4242" } }]
                }),
                retrieve: jest.fn().mockResolvedValueOnce({
                    invoice_settings: {
                        default_payment_method: "pm_123"
                    }
                })
            },
            subscriptions: {
                list: jest.fn().mockResolvedValueOnce({
                    data: [{
                        id: "sub_123",
                        current_period_start: 1640995200,
                        current_period_end: 1643673600
                    }]
                })
            },
            invoices: {
                retrieveUpcoming: jest.fn().mockResolvedValueOnce({
                    total: 1000,
                    total_excluding_tax: 850,
                    tax: 150,
                    amount_due: 1000,
                    created: 1640995200,
                    period_start: 1640995200,
                    period_end: 1643673600
                }),
                list: jest.fn().mockResolvedValueOnce({
                    data: [{
                        id: "inv_123",
                        total: 1000,
                        amount_due: 0,
                        created: 1638316800,
                        period_start: 1638316800,
                        period_end: 1640995200,
                        paid: true
                    }]
                })
            }
        };

        mockStripe.mockImplementation(() => mockStripeInstance as any);

        const result = await handler({
            requestContext: {
                authorizer: {
                    claims: { sub: "user123" }
                }
            }
        } as any);

        // Verify
        expect(result.statusCode).toBe(200);
        const responseBody = JSON.parse(result.body);
        expect(responseBody).toHaveProperty("organization");
        expect(responseBody.organization).toHaveProperty("billingData");
        expect(responseBody.organization).toMatchObject({
            name: "Test Org",
            date_registered: "2023-01-01"
        });
        expect(responseBody.organization.billingData).toMatchObject({
            total: 850,
            tax: 150,
            active: true,
            currPaymentMethod: "pm_123"
        });
        expect(responseBody.organization.billingData.paymentMethods).toHaveLength(1);
        expect(responseBody.organization.billingData.invoices).toHaveLength(2); // Upcoming + 1 past invoice
    });

    test("should return inactive billing data when user has no active subscriptions", async () => {
        ddbMock.on(GetCommand, {
            TableName: "test-user-table",
            Key: { id: "user123" }
        }).resolves({
            Item: {
                orgId: "org123",
                permissions: ["read", "write"]
            }
        });

        ddbMock.on(GetCommand, {
            TableName: "test-org-table",
            Key: { id: "org123" }
        }).resolves({
            Item: {
                id: "org123",
                linked: true,
                name: "Test Org",
                stripe_id: "cus_123456",
                images: { logo: "logo-url" },
                date_registered: "2023-01-01"
            }
        });

        const mockStripeInstance = {
            customers: {
                listPaymentMethods: jest.fn().mockResolvedValueOnce({
                    data: []
                }),
                retrieve: jest.fn().mockResolvedValueOnce({
                    invoice_settings: null
                })
            },
            subscriptions: {
                list: jest.fn().mockResolvedValueOnce({
                    data: []
                })
            }
        };

        mockStripe.mockImplementation(() => mockStripeInstance as any);

        const result = await handler({
            requestContext: {
                authorizer: {
                    claims: { sub: "user123" }
                }
            }
        } as any);

        expect(result.statusCode).toBe(200);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.organization.billingData).toMatchObject({
            total: 0,
            tax: 0,
            active: false,
            currPaymentMethod: null,
            paymentWindow: {
                start: null,
                end: null
            }
        });
        expect(responseBody.organization.billingData.invoices).toEqual([]);
    });

    test("should handle errors gracefully", async () => {
        ddbMock.on(GetCommand).rejects(new Error("Database error"));

        const result = await handler({
            requestContext: {
                authorizer: {
                    claims: { sub: "user123" }
                }
            }
        } as any);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toHaveProperty("error");
    });
});