import { handler } from "../../../lambda/shop/newShop";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { randomUUID } from "crypto";

// Mock UUID generation
jest.mock("crypto", () => ({
    randomUUID: jest.fn().mockReturnValue("test-shop-id-123"),
}));

// Mock DynamoDB Client
const mockDynamoDbSend = jest.fn(async (command: any) => {
    if (command instanceof GetCommand) {
        if (command.input.TableName === "mock-org-table") {
            return { Item: { id: "test-org-id-123" } };
        }
        if (command.input.TableName === "mock-user-table") {
            return { Item: { id: "test-user-id-123", orgId: "test-org-id-123" } };
        }
        return { Item: null };
    }
    if (command instanceof PutCommand || command instanceof UpdateCommand) {
        return {};
    }
    throw new Error("Unknown command");
});

jest.mock("@aws-sdk/lib-dynamodb", () => {
    return {
        GetCommand: jest.fn(),
        PutCommand: jest.fn(),
        UpdateCommand: jest.fn(),
        DynamoDBDocumentClient: {
            from: jest.fn().mockReturnValue({
                send: mockDynamoDbSend,
            }),
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

    test("should return 404 if organization does not exist", async () => {
        mockDynamoDbSend.mockResolvedValueOnce({ Item: null });

        const testEvent: APIGatewayProxyEvent = {
            body: JSON.stringify({
                org_id: "non-existent-org",
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
        expect(response.statusCode).toBe(404);
        expect(JSON.parse(response.body)).toHaveProperty("error", "Organization not found");
    });

    test("should return 403 if user is not associated with the organization", async () => {
        mockDynamoDbSend.mockImplementation(async (command: any) => {
            if (command instanceof GetCommand && command.input.TableName === "mock-user-table") {
                return { Item: { id: "test-user-id-123", orgId: "another-org-id" } };
            }
            return { Item: { id: "test-org-id-123" } };
        });

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
        expect(response.statusCode).toBe(403);
        expect(JSON.parse(response.body)).toHaveProperty("error", "User is not associated with the specified Organization");
    });

    test("should return 500 if an unexpected error occurs", async () => {
        mockDynamoDbSend.mockRejectedValue(new Error("Unexpected error"));

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
