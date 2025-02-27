import { handler } from "../../../lambda/organization/newOrganization";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Stripe from "stripe";
import { APIGatewayProxyEvent } from "aws-lambda";

jest.mock("@aws-sdk/client-secrets-manager");
jest.mock("@aws-sdk/client-s3");
jest.mock("@aws-sdk/s3-request-presigner");
jest.mock('stripe', () => {
    const mockStripeInstance = {
        customers: {
            create: jest.fn().mockResolvedValue({
                id: "cust_123",
                name: "Jest_User",
                currency: "sgd",
                description: "Jest User Account created",
            }),

        },
    };

    const MockStripe = jest.fn(() => mockStripeInstance);

    return {
        __esModule: true,
        default: MockStripe, 
    };
});

jest.mock('@aws-sdk/client-dynamodb');
jest.mock('crypto', () => ({
    randomUUID: jest.fn().mockReturnValue('test-organization-id-123')
  }));
jest.mock("@aws-sdk/lib-dynamodb", () => {
    const actualModule = jest.requireActual("@aws-sdk/lib-dynamodb");
    return {
        ...actualModule,
        DynamoDBDocumentClient: {
            from: jest.fn().mockReturnValue({
                send: jest.fn(async (command) => {
                    if (command instanceof GetCommand) {
                        return {
                            Item: {
                                user_id: "test-user-123",
                                email: "test@example.com"
                            }
                        };
                    }
                    if (command instanceof PutCommand) {
                        return {};
                    }
                    if (command instanceof UpdateCommand) {
                        return {};
                    }
                    throw new Error("Unknown command");
                }),
            }),
        },
    };
});

describe("Organization Lambda Handler", () => {
    const mockGetSignedUrl = getSignedUrl as jest.Mock;
    const mockS3Send = jest.fn();

    beforeAll(() => {
        process.env.ORG_TABLE = "mock-org-table";
        process.env.USER_TABLE = "mock-user-table";
        process.env.BUCKET_NAME = "mock-bucket";
        process.env.IMAGE_DOMAIN = "mock-domain";
        process.env.STRIPE_ARN = "mock_stripe_arn";

        (SecretsManagerClient.prototype.send as jest.Mock).mockImplementation(() => ({
            SecretString: JSON.stringify({ secretKey: "test_stripe_secret" })
        }));

        (S3Client.prototype.send as jest.Mock).mockImplementation(mockS3Send);
        
        mockGetSignedUrl.mockResolvedValue("https://presigned-url.example.com");

    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("should successfully create a new organization", async () => {
        const testEvent = {
            body: JSON.stringify({
                userSub: "test-user-123",
                org_name: "Test Organization",
                description: "Test Description",
                rewards_loyalty: true,
                rewards_milestone: true,
                rl_active: true,
                rm_active: true
            })
        };

        const stripe = new Stripe("test_secret_key", { apiVersion: "2025-01-27.acacia" });

        const { randomUUID } = require('crypto');
        const response = await handler(testEvent as APIGatewayProxyEvent);
        const responseBody = JSON.parse(response.body);

        expect(randomUUID).toHaveBeenCalled();;

        expect(stripe.customers.create).toHaveBeenCalledWith({
            name: "Test Organization",
            email: "test@example.com",
            description: expect.stringContaining("Organization ID:"),
            metadata: expect.any(Object)
        });

        expect(response.statusCode).toBe(200);
        expect(responseBody).toHaveProperty("stripe_customer_id");
        expect(responseBody).toHaveProperty("preSignedUrls");
        expect(Array.isArray(responseBody.preSignedUrls)).toBeTruthy()

    });

    test("should handle user not found in DynamoDB", async () => {
        const testEvent = {
            body: JSON.stringify({
                userSub: null,
                org_name: "Test Organization",
                description: "Test Description"
            })
        };

        const response = await handler(testEvent as APIGatewayProxyEvent);
        
        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toHaveProperty("error", "User ID is required");
    });

    test("should handle missing user_id", async () => {
        const testEvent = {
            body: JSON.stringify({
                org_name: "Test Organization",
                description: "Test Description"
            })
        };

        const response = await handler(testEvent as APIGatewayProxyEvent);
        
        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toHaveProperty("error", "User ID is required");
    });

    test("should handle missing request body", async () => {
        const response = await handler({} as APIGatewayProxyEvent);
        
        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toHaveProperty("error", "Request body is required");
    });

    afterAll(() => {
        delete process.env.ORG_TABLE;
        delete process.env.USER_TABLE;
        delete process.env.BUCKET_NAME;
        delete process.env.IMAGE_DOMAIN;
        delete process.env.STRIPE_SECRET;
    });
});