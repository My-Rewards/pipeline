import { APIGatewayProxyEvent } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "@/lambda/shop/newShop"; // Adjust path as needed

// Mock modules
jest.mock("crypto", () => ({
    randomUUID: jest.fn(() => "mocked-uuid-123")
}));

// Setup mocks
const ddbMock = mockClient(DynamoDBDocumentClient);

describe("Shop Creation Lambda Handler", () => {
    const createMockEvent = (body: any, userSub?: string): APIGatewayProxyEvent => {
        return {
            body: typeof body === 'string' ? body : JSON.stringify(body),
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

    // Environment variable setup
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        ddbMock.reset();

        // Setup environment variables
        process.env = {
            ...originalEnv,
            SHOP_TABLE: "test-shop-table",
            USER_TABLE: "test-user-table",
            ORG_TABLE: "test-org-table"
        };

        // Set the date to a fixed value
        jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2023-01-01T00:00:00.000Z');
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    test("should return 400 when request body is missing", async () => {
        // Arrange
        const event = { ...createMockEvent({}, "user123"), body: null };

        // Act
        const result = await handler(event);

        // Assert
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toHaveProperty("error", "Request body is required");
    });

    test("should return 404 when environment variables are missing", async () => {
        // Arrange
        const event = createMockEvent({
            square_id: "sq_123",
            latitude: 37.7749,
            longitude: -122.4194,
            shop_hours: { "monday": "9:00-17:00" }
        }, "user123");

        // Test each required environment variable
        const envVarTests = [
            { varName: "SHOP_TABLE", expectedError: "Missing Shop Table Info" },
            { varName: "USER_TABLE", expectedError: "Missing User Table Info" },
            { varName: "ORG_TABLE", expectedError: "Missing Organization Table Info" }
        ];

        for (const test of envVarTests) {
            // Reset environment variables
            process.env = { ...originalEnv };
            // Set all required env vars except the one we're testing
            envVarTests.forEach(({ varName }) => {
                if (varName !== test.varName) {
                    process.env[varName] = `test-${varName.toLowerCase()}`;
                }
            });

            // Act
            const result = await handler(event);

            // Assert
            expect(result.statusCode).toBe(404);
            expect(JSON.parse(result.body)).toHaveProperty("error", test.expectedError);
        }
    });

    test("should return 400 when user is not authenticated", async () => {
        // Arrange
        const event = createMockEvent({
            square_id: "sq_123",
            latitude: 37.7749,
            longitude: -122.4194,
            shop_hours: { "monday": "9:00-17:00" }
        }); // No userSub

        // Act
        const result = await handler(event);

        // Assert
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toHaveProperty("error", "User ID is required");
    });

    test("should return 400 when required fields are missing", async () => {
        // Arrange - test each required field
        const requiredFields = ["square_id", "latitude", "longitude", "shop_hours"];

        for (const field of requiredFields) {
            const body = {
                square_id: "sq_123",
                latitude: 37.7749,
                longitude: -122.4194,
                shop_hours: { "monday": "9:00-17:00" }
            };

            // Remove one required field
            delete body[field as keyof typeof body];

            const event = createMockEvent(body, "user123");

            // Act
            const result = await handler(event);

            // Assert
            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body)).toHaveProperty("error", "Missing required fields");
        }
    });

    test("should return 210 when user is not found", async () => {
        // Arrange
        const event = createMockEvent({
            square_id: "sq_123",
            latitude: 37.7749,
            longitude: -122.4194,
            shop_hours: { "monday": "9:00-17:00" }
        }, "user123");

        // Mock DynamoDB to return null for user
        ddbMock.on(GetCommand, {
            TableName: "test-user-table",
            Key: { id: "user123" }
        }).resolves({
            Item: undefined // User not found
        });

        // Act
        const result = await handler(event);

        // Assert
        expect(result.statusCode).toBe(210);
        expect(JSON.parse(result.body)).toHaveProperty("error", "User email not found in database or User already linked to Organization");
    });

    test("should return 210 when user has no organization", async () => {
        // Arrange
        const event = createMockEvent({
            square_id: "sq_123",
            latitude: 37.7749,
            longitude: -122.4194,
            shop_hours: { "monday": "9:00-17:00" }
        }, "user123");

        // Mock DynamoDB to return a user without org_id
        ddbMock.on(GetCommand, {
            TableName: "test-user-table",
            Key: { id: "user123" }
        }).resolves({
            Item: {
                id: "user123",
                permissions: ["admin"]
            }
        });

        // Act
        const result = await handler(event);

        // Assert
        expect(result.statusCode).toBe(210);
        expect(JSON.parse(result.body)).toHaveProperty("error", "Organization not found");
    });

    test("should return 210 when organization is not found", async () => {
        // Arrange
        const event = createMockEvent({
            square_id: "sq_123",
            latitude: 37.7749,
            longitude: -122.4194,
            shop_hours: { "monday": "9:00-17:00" }
        }, "user123");

        // First GetCommand - get user
        ddbMock.on(GetCommand, {
            TableName: "test-user-table",
            Key: { id: "user123" }
        }).resolves({
            Item: {
                id: "user123",
                org_id: "org123",
                permissions: ["admin"]
            }
        });

        // Second GetCommand - org not found
        ddbMock.on(GetCommand, {
            TableName: "test-org-table",
            Key: { id: "org123" }
        }).resolves({
            Item: undefined
        });

        // Act
        const result = await handler(event);

        // Assert
        expect(result.statusCode).toBe(210);
        expect(JSON.parse(result.body)).toHaveProperty("error", "Organization not found");
    });

    test("should return 403 when user is not associated with the organization", async () => {
        // Arrange
        const event = createMockEvent({
            square_id: "sq_123",
            latitude: 37.7749,
            longitude: -122.4194,
            shop_hours: { "monday": "9:00-17:00" }
        }, "user123");

        // First GetCommand - get user with org_id
        ddbMock.on(GetCommand, {
            TableName: "test-user-table",
            Key: { id: "user123" },
            ProjectionExpression: "org_id, #userPermissions",
            ExpressionAttributeNames: { "#userPermissions": "permissions" }
        }).resolves({
            Item: {
                id: "user123",
                org_id: "org123",
                permissions: ["admin"]
            }
        });

        // Second GetCommand - organization found
        ddbMock.on(GetCommand, {
            TableName: "test-org-table",
            Key: { id: "org123" }
        }).resolves({
            Item: { id: "org123", name: "Test Org" }
        });

        // Third GetCommand - user check returns wrong org_id
        ddbMock.on(GetCommand, {
            TableName: "test-user-table",
            Key: { id: "user123" },
            ProjectionExpression: "org_id"
        }).resolves({
            Item: {
                id: "user123",
                org_id: "different-org-id" // Different org_id
            }
        });

        // Act
        const result = await handler(event);

        // Assert
        expect(result.statusCode).toBe(403);
        expect(JSON.parse(result.body)).toHaveProperty("error", "User is not associated with the specified Organization");
    });

    test("should successfully create a shop", async () => {
        // Arrange
        const event = createMockEvent({
            square_id: "sq_123",
            latitude: 37.7749,
            longitude: -122.4194,
            shop_hours: { "monday": "9:00-17:00" }
        }, "user123");

        // First GetCommand - get user with org_id
        ddbMock.on(GetCommand, {
            TableName: "test-user-table",
            Key: { id: "user123" },
            ProjectionExpression: "org_id, #userPermissions",
            ExpressionAttributeNames: { "#userPermissions": "permissions" }
        }).resolves({
            Item: {
                id: "user123",
                org_id: "org123",
                permissions: ["admin"]
            }
        });

        // Second GetCommand - organization found
        ddbMock.on(GetCommand, {
            TableName: "test-org-table",
            Key: { id: "org123" }
        }).resolves({
            Item: { id: "org123", name: "Test Org" }
        });

        // Third GetCommand - user check returns same org_id
        ddbMock.on(GetCommand, {
            TableName: "test-user-table",
            Key: { id: "user123" },
            ProjectionExpression: "org_id"
        }).resolves({
            Item: {
                id: "user123",
                org_id: "org123" // Same org_id
            }
        });

        // Mock PutCommand
        ddbMock.on(PutCommand).resolves({});

        // Mock UpdateCommand
        ddbMock.on(UpdateCommand).resolves({});

        // Act
        const result = await handler(event);

        // Assert
        expect(result.statusCode).toBe(201);
        const body = JSON.parse(result.body);
        expect(body.message).toBe("Shop created successfully");
        expect(body.shop_id).toBe("mocked-uuid-123");

        // Verify DynamoDB PutCommand
        const putCalls = ddbMock.commandCalls(PutCommand);
        expect(putCalls).toHaveLength(1);

        const putParams = putCalls[0].args[0].input;
        expect(putParams.TableName).toBe("test-shop-table");
        expect(putParams.Item).toEqual({
            id: "mocked-uuid-123",
            org_id: "org123",
            square_id: "sq_123",
            latitude: 37.7749,
            longitude: -122.4194,
            shop_hours: { "monday": "9:00-17:00" },
            active: false,
            created_at: "2023-01-01T00:00:00.000Z",
            updated_at: "2023-01-01T00:00:00.000Z"
        });

        // Verify DynamoDB UpdateCommand
        const updateCalls = ddbMock.commandCalls(UpdateCommand);
        expect(updateCalls).toHaveLength(1);

        const updateParams = updateCalls[0].args[0].input;
        expect(updateParams.TableName).toBe("test-org-table");
        expect(updateParams.Key).toEqual({ id: "org123" });
        expect(updateParams.UpdateExpression).toBe("SET shop_id = :shopId");
        expect(updateParams.ExpressionAttributeValues).toEqual({ ":shopId": "mocked-uuid-123" });
    });

    test("should handle internal server errors", async () => {
        // Arrange
        const event = createMockEvent({
            square_id: "sq_123",
            latitude: 37.7749,
            longitude: -122.4194,
            shop_hours: { "monday": "9:00-17:00" }
        }, "user123");

        // Make DynamoDB throw an error
        ddbMock.on(GetCommand).rejects(new Error("Database connection error"));

        // Spy on console.error
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        // Act
        const result = await handler(event);

        // Assert
        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toHaveProperty("error", "Internal Server Error");
        expect(consoleErrorSpy).toHaveBeenCalledWith("Error creating shop:", expect.any(Error));

        // Restore console.error
        consoleErrorSpy.mockRestore();
    });

    test("should handle malformed JSON in request body", async () => {
        // Arrange
        const event = createMockEvent("{malformed json", "user123");

        // Spy on console.error
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        // Act
        const result = await handler(event);

        // Assert
        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toHaveProperty("error", "Internal Server Error");
        expect(consoleErrorSpy).toHaveBeenCalled();

        // Restore console.error
        consoleErrorSpy.mockRestore();
    });
});