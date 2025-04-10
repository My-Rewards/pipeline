import { APIGatewayProxyEvent } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as presigner from "@aws-sdk/s3-request-presigner";
import Stripe from "stripe";
import { handler } from "@/lambda/organization/newOrganization"; // Adjust path as needed
import * as validOrganization from "@/lambda/constants/validOrganization";

jest.mock("crypto", () => ({
    randomUUID: jest.fn(() => "mocked-uuid-123")
}));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
    getSignedUrl: jest.fn()
}));

jest.mock("stripe");

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const mockGetStripeSecret = jest.spyOn(validOrganization, "getStripeSecret");

describe("createOrganization Lambda Handler", () => {
    const createMockEvent = (body: any, userSub?: string): APIGatewayProxyEvent => {
        return {
            body: JSON.stringify(body),
            requestContext: {
                authorizer: userSub
                    ? {
                        claims: {
                            sub: userSub,
                        },
                    }
                    : undefined,
            },
        } as unknown as APIGatewayProxyEvent;
    };

    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        ddbMock.reset();
        s3Mock.reset();

        process.env = {
            ...originalEnv,
            ORG_TABLE: "test-org-table",
            USER_TABLE: "test-user-table",
            BUCKET_NAME: "test-bucket",
            IMAGE_DOMAIN: "test-image-domain.com",
            STRIPE_ARN: "test-stripe-arn",
        };

        mockGetStripeSecret.mockResolvedValue("test-stripe-key");

        (Stripe as unknown as jest.Mock).mockImplementation(() => ({
            customers: {
                create: jest.fn().mockResolvedValue({
                    id: "test-stripe-customer-id"
                })
            },
        }));

        (presigner.getSignedUrl as jest.Mock).mockResolvedValue("https://presigned-url.com");

    });

    afterEach(() => {
        process.env = originalEnv;
        (Stripe as unknown as jest.Mock).mockReset();
    });

    test("should return 400 when request body is missing", async () => {
        const event = { ...createMockEvent({}, "user123"), body: null };

        const result = await handler(event);

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toHaveProperty("error", "Request body is required");
    });

    test("should return 404 when environment variables are missing", async () => {
        const event = createMockEvent({
            org_name: "Test Org",
            description: "Test description",
        }, "user123");

        const envVarTests = [
            { varName: "ORG_TABLE", expectedError: "Missing Table Info" },
            { varName: "USER_TABLE", expectedError: "Missing Table Info" },
            { varName: "STRIPE_ARN", expectedError: "Missing Stripe ARN" },
            { varName: "IMAGE_DOMAIN", expectedError: "Missing Image Domain" },
            { varName: "BUCKET_NAME", expectedError: "Missing Image Bucket Name" },
        ];

        for (const test of envVarTests) {
            process.env = { ...originalEnv };
            envVarTests.forEach(({ varName }) => {
                if (varName !== test.varName) {
                    process.env[varName] = `test-${varName.toLowerCase()}`;
                }
            });

            const result = await handler(event);

            expect(result.statusCode).toBe(404);
            expect(result.body).toBe(test.expectedError);
        }
    });

    test("should return 400 when user is not authenticated", async () => {
        const event = createMockEvent({
            org_name: "Test Org",
            description: "Test description",
        });

        const result = await handler(event);

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toHaveProperty("error", "User ID is required");
    });

    test("should return 500 when required body fields are missing", async () => {
        const event = createMockEvent({
        }, "user123");

        const result = await handler(event);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toHaveProperty("error", "Body Incomplete");
    });

    test("should return 500 when Stripe secret retrieval fails", async () => {
        const event = createMockEvent({
            org_name: "Test Org",
            description: "Test description",
        }, "user123");

        mockGetStripeSecret.mockResolvedValue(null);

        const result = await handler(event);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toHaveProperty("error", "Failed to retrieve Stripe secret key");
    });

    test("should return 500 when user email is not found or already linked to organization", async () => {
        const event = createMockEvent({
            org_name: "Test Org",
            description: "Test description",
        }, "user123");

        ddbMock.on(GetCommand, {
            TableName: "test-user-table",
            Key: { id: "user123" },
            ProjectionExpression: "email, orgId",
        }).resolves({
            Item: { orgId: "existing-org-id" }
        });

        const result = await handler(event);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toHaveProperty("error", "User email not found in database or User already linked to Organization");
    });

    test("should successfully create an organization", async () => {

        // Arrange
        const event = createMockEvent({
            org_name: "Test Organization",
            description: "Test description",
            rewards_loyalty: { points_per_visit: 10 },
            rewards_milestone: { visits_for_reward: 5 },
            rl_active: true,
            rm_active: false,
            businessTags: ["coffee", "bakery"]
        }, "user123");

        // Mock DynamoDB to return a valid user
        ddbMock.on(GetCommand).resolves({
            Item: { email: "test@example.com" }
        });

        // Mock DynamoDB operations
        ddbMock.on(PutCommand).resolves({});
        ddbMock.on(UpdateCommand).resolves({});

        // Act
        const result = await handler(event);

        // Assert
        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.message).toBe("Success");
        expect(body.preSignedUrls).toHaveLength(3);
        expect(body.preSignedUrls[0]).toHaveProperty("fileKey", "mocked-uuid-123/logo");
        expect(body.preSignedUrls[1]).toHaveProperty("fileKey", "mocked-uuid-123/preview");
        expect(body.preSignedUrls[2]).toHaveProperty("fileKey", "mocked-uuid-123/banner");

        expect(ddbMock.calls()).toHaveLength(3);

        const putCalls = ddbMock.commandCalls(PutCommand);
        expect(putCalls).toHaveLength(1);

        const orgData = putCalls[0].args[0].input.Item;
        expect(orgData).toHaveProperty("id", "mocked-uuid-123");
        expect(orgData).toHaveProperty("stripe_id", "test-stripe-customer-id");
        expect(orgData).toHaveProperty("owner_id", "user123");
        expect(orgData).toHaveProperty("name", "Test Organization");
        expect(orgData).toHaveProperty("description", "Test description");
        expect(orgData).toHaveProperty("tags", ["coffee", "bakery"]);
        expect(orgData).toHaveProperty("rl_active", true);
        expect(orgData).toHaveProperty("rm_active", false);
        expect(orgData).toHaveProperty("active", false);
        expect(orgData).toHaveProperty("linked", false);

        const updateCalls = ddbMock.commandCalls(UpdateCommand);
        expect(updateCalls).toHaveLength(1);
        expect(updateCalls[0].args[0].input.Key).toEqual({ id: "user123" });
        expect(updateCalls[0].args[0].input.UpdateExpression).toBe("SET orgId = :org_id");
        expect(updateCalls[0].args[0].input.ExpressionAttributeValues).toEqual({ ":org_id": "mocked-uuid-123" });
    });

    test("should handle Stripe failure", async () => {
        jest.resetAllMocks();
        jest.clearAllMocks();

        // Arrange
        const event = createMockEvent({
            org_name: "Test Org",
            description: "Test description",
        }, "user123");

        // Mock DynamoDB to return a valid user
        ddbMock.on(GetCommand).resolves({
            Item: { email: "test@example.com" }
        });

        // Set new implementation after reset
        (Stripe as unknown as jest.Mock).mockImplementation(() => ({
            customers: {
                create: jest.fn().mockRejectedValue(new Error("Stripe API Error")),
            },
        }));

        // Act
        const result = await handler(event);

        // Assert
        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body).error).toEqual("Stripe Failed to create Customer");
    });

    test("should handle unexpected errors gracefully", async () => {

        const event = createMockEvent({
            org_name: "Test Organization",
            description: "Test description",
        }, "user123");

        ddbMock.on(GetCommand).rejects(new Error("Unexpected database error"));

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        const result = await handler(event);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toEqual({error: "User email not found in database or User already linked to Organization"});

        consoleErrorSpy.mockRestore();
    });
});