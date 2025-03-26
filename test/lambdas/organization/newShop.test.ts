import { handler } from "../../../lambda/shop/newShop";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { randomUUID } from "crypto";

// Mock UUID generation
jest.mock("crypto", () => ({
    randomUUID: jest.fn().mockReturnValue("test-shop-id-123"),
}));

jest.mock("@aws-sdk/client-dynamodb", () => {
    const actual = jest.requireActual("@aws-sdk/client-dynamodb");
    return {
        ...actual,
        DynamoDBClient: jest.fn().mockImplementation(() => ({
            send: jest.fn(),
        })),
    };
});

jest.mock("@aws-sdk/lib-dynamodb", () => {
    const actualModule = jest.requireActual("@aws-sdk/lib-dynamodb");

    // Define a mock send function that uses the actual module's GetCommand for instanceof checks.
    const mockDynamoDbSend = jest.fn(async (command: any) => {
        if (command instanceof actualModule.GetCommand) {
            if (command.input.TableName === "mock-org-table") {
                return { Item: { id: "test-org-id-123" } };
            }
            if (command.input.TableName === "mock-user-table") {
                return { Item: { id: "test-user-id-123", org_id: "test-org-id-123", email: "test@example.com" } };
            }
            return { Item: null };
        }
        if (command instanceof actualModule.PutCommand || command instanceof actualModule.UpdateCommand) {
            return {};
        }
        throw new Error("Unknown command");
    });

    return {
        ...actualModule,
        GetCommand: actualModule.GetCommand,
        PutCommand: actualModule.PutCommand,
        UpdateCommand: actualModule.UpdateCommand,
        DynamoDBDocumentClient: {
            from: jest.fn(() => ({
                send: mockDynamoDbSend,
            })),
        },
    };
});

describe("Shop Lambda Handler", () => {
    beforeAll(() => {
        process.env.SHOP_TABLE = "mock-shop-table";
        process.env.USER_TABLE = "mock-user-table";
        process.env.ORG_TABLE = "mock-org-table";
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("should successfully create a new shop", async () => {
        // For successful flow, we let the default mockDynamoDbSend behavior run.
        const testEvent: APIGatewayProxyEvent = {
            body: JSON.stringify({
                org_id: "test-org-id-123", // not used in handler; user's org_id is determined via getUser
                square_id: "test-square-id-456",
                latitude: 40.7128,
                longitude: -74.0060,
                shop_hours: "9 AM - 9 PM",
            }),
            requestContext: {
                authorizer: { claims: { sub: "test-user-id-123" } },
            },
        } as any;

        const response = await handler(testEvent);
        const responseBody = JSON.parse(response.body);

        expect(randomUUID).toHaveBeenCalled();
        expect(response.statusCode).toBe(201);
        expect(responseBody).toHaveProperty("shopId", "test-shop-id-123");
        expect(responseBody).toHaveProperty("message", "Shop created successfully");
    });

    test("should return 400 if request body is missing", async () => {
        const response = await handler({} as APIGatewayProxyEvent);
        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toHaveProperty("error", "Request body is required");
    });

    test("should return 400 if required fields are missing", async () => {
        const testEvent: APIGatewayProxyEvent = {
            body: JSON.stringify({
                org_id: "test-org-id-123",
                square_id: "test-square-id-456",
            }),
            requestContext: {
                authorizer: { claims: { sub: "test-user-id-123" } },
            },
        } as any;
        const response = await handler(testEvent);
        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toHaveProperty("error", "Missing required fields");
    });

    test("should return 210 if organization does not exist", async () => {
        const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
        const instance = DynamoDBDocumentClient.from(new DynamoDBClient({}));
        // Simulate getUser call (first call) returns a valid user record.
        instance.send.mockResolvedValueOnce({ Item: { id: "test-user-id-123", org_id: "test-org-id-123", email: "test@example.com" } });
        // Simulate org lookup (second call) returns null.
        instance.send.mockResolvedValueOnce({ Item: null });

        const testEvent: APIGatewayProxyEvent = {
            body: JSON.stringify({
                org_id: "non-existent-org", // Not used: org_id is determined by the user's record.
                square_id: "test-square-id-456",
                latitude: 40.7128,
                longitude: -74.0060,
                shop_hours: "9 AM - 9 PM",
            }),
            requestContext: {
                authorizer: { claims: { sub: "test-user-id-123" } },
            },
        } as any;
        const response = await handler(testEvent);
        expect(response.statusCode).toBe(210);
        expect(JSON.parse(response.body)).toHaveProperty("error", "Organization not found");
    });

    test("should return 210 if user is not found", async () => {
        const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
        const instance = DynamoDBDocumentClient.from(new DynamoDBClient({}));
        // Simulate getUser call returns null.
        instance.send.mockResolvedValueOnce({ Item: null });

        const testEvent: APIGatewayProxyEvent = {
            body: JSON.stringify({
                org_id: "test-org-id-123",
                square_id: "test-square-id-456",
                latitude: 40.7128,
                longitude: -74.0060,
                shop_hours: "9 AM - 9 PM",
            }),
            requestContext: {
                authorizer: { claims: { sub: "test-user-id-123" } },
            },
        } as any;
        const response = await handler(testEvent);
        expect(response.statusCode).toBe(210);
        expect(JSON.parse(response.body)).toHaveProperty("error", "User email not found in database or User already linked to Organization");
    });

    test("should return 500 if an unexpected error occurs", async () => {
        const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
        const instance = DynamoDBDocumentClient.from(new DynamoDBClient({}));
        instance.send.mockRejectedValueOnce(new Error("Unexpected error"));

        const testEvent: APIGatewayProxyEvent = {
            body: JSON.stringify({
                org_id: "test-org-id-123",
                square_id: "test-square-id-456",
                latitude: 40.7128,
                longitude: -74.0060,
                shop_hours: "9 AM - 9 PM",
            }),
            requestContext: {
                authorizer: { claims: { sub: "test-user-id-123" } },
            },
        } as any;
        const response = await handler(testEvent);
        expect(response.statusCode).toBe(500);
        expect(JSON.parse(response.body)).toHaveProperty("error", "Internal Server Error");
    });

    afterAll(() => {
        delete process.env.SHOP_TABLE;
        delete process.env.USER_TABLE;
        delete process.env.ORG_TABLE;
    });
});
