import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "@/lambda/user/Plans/getPlan";

// Mock DynamoDB client
const ddbMock = mockClient(DynamoDBDocumentClient);

// Save original env and setup test env
const originalEnv = process.env;

describe('getPlan Lambda Handler', () => {
  // Mock event with authorization
  const createMockEvent = (queryStringParameters: Record<string, string> = {}, userSub?: string): APIGatewayProxyEvent => {
    return {
      queryStringParameters,
      requestContext: {
        authorizer: userSub ? {
          claims: {
            sub: userSub
          }
        } : undefined
      }
    } as unknown as APIGatewayProxyEvent;
  };

  beforeEach(() => {
    // Reset mocks before each test
    jest.resetModules();
    ddbMock.reset();

    // Setup environment variables
    process.env = {
      ...originalEnv,
      PLANS_TABLE: 'test-plans-table',
      ORG_TABLE: 'test-org-table',
      LIKES_TABLE: 'test-likes-table'
    };
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  test('should return 500 when environment variables are missing', async () => {
    // Arrange
    process.env.PLANS_TABLE = undefined;
    const event = createMockEvent({ org_id: 'test-org-id' }, 'test-user-id');

    // Act
    const result = await handler(event);

    // Assert
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Missing env values');
  });

  test('should return 404 when userSub is missing', async () => {
    // Arrange
    const event = createMockEvent({ org_id: 'test-org-id' });

    // Act
    const result = await handler(event);

    // Assert
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe('Missing userSub');
  });

  test('should return 404 when org_id parameter is missing', async () => {
    // Arrange
    const event = createMockEvent({}, 'test-user-id');

    // Act
    const result = await handler(event);

    // Assert
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe('Missing [org_id] parameter');
  });

  test('should return 404 when organization is not found', async () => {
    // Arrange
    const event = createMockEvent({ org_id: 'non-existent-org' }, 'test-user-id');

    // Mock DynamoDB to return null for organization
    ddbMock.on(GetCommand, {
      TableName: 'test-org-table',
      Key: { id: 'non-existent-org' },
      ProjectionExpression: "id, name, description, images",
    }).resolves({
      Item: undefined
    });

    // Act
    const result = await handler(event);

    // Assert
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe('Organization not found');
  });

  test('should return a new empty plan when user has no existing plan', async () => {
    // Arrange
    const orgId = 'test-org-id';
    const userId = 'test-user-id';
    const event = createMockEvent({ org_id: orgId }, userId);

    // Mock organization retrieval
    const mockOrg = {
      id: orgId,
      name: 'Test Organization',
      rl_active: true,
      rm_active: false,
      rewards_loyalty: {
        reward_type: 'points',
        points_per_visit: 10
      }
    };

    ddbMock.on(GetCommand, {
      TableName: 'test-org-table',
      Key: { id: orgId },
      ProjectionExpression: "id, name, description, images",
    }).resolves({
      Item: mockOrg
    });

    // Mock plan retrieval - no existing plan
    ddbMock.on(GetCommand, {
      TableName: 'test-plans-table',
      Key: {
        PK: `USER#${userId}`,
        SK: `ORG#${orgId}`
      }
    }).resolves({
      Item: undefined
    });

    // Act
    const result = await handler(event);

    // Assert
    expect(result.statusCode).toBe(200);
    const plan = JSON.parse(result.body);
    expect(plan).toEqual({
      reward_plan: {
        rewards_loyalty: mockOrg.rewards_loyalty,
        rewards_milestone: undefined
      },
      visits: 0,
      points: 0,
      redeemableRewards: [],
      rl_active: true,
      rm_active: false,
      firstPlan: false,
      activePlan: false,
      active: false,
      organization_id: mockOrg.id,
      name: mockOrg.name
    });
  });

  test('should return existing plan data when user has a plan', async () => {
    // Arrange
    const orgId = 'test-org-id';
    const userId = 'test-user-id';
    const event = createMockEvent({ org_id: orgId }, userId);

    // Mock organization retrieval
    const mockOrg = {
      id: orgId,
      name: 'Test Organization',
      rl_active: true,
      rm_active: true,
      rewards_loyalty: {
        reward_type: 'points',
        points_per_visit: 10
      },
      rewards_milestone: {
        milestone_visits: 10,
        reward_item: 'Free Coffee'
      }
    };

    ddbMock.on(GetCommand, {
      TableName: 'test-org-table',
      Key: { id: orgId },
      ProjectionExpression: "id, name, description, images",
    }).resolves({
      Item: mockOrg
    });

    // Mock existing plan retrieval
    const mockPlan = {
      id: 'test-plan-id',
      visits: 5,
      points: 50,
      redeemableRewards: ['Free Item'],
      active: true
    };

    ddbMock.on(GetCommand, {
      TableName: 'test-plans-table',
      Key: {
        PK: `USER#${userId}`,
        SK: `ORG#${orgId}`
      }
    }).resolves({
      Item: mockPlan
    });

    // Act
    const result = await handler(event);

    // Assert
    expect(result.statusCode).toBe(200);
    const plan = JSON.parse(result.body);
    expect(plan).toEqual({
      reward_plan: {
        rewards_loyalty: mockOrg.rewards_loyalty,
        rewards_milestone: mockOrg.rewards_milestone
      },
      visits: 5,
      points: 50,
      redeemableRewards: ['Free Item'],
      rl_active: true,
      rm_active: true,
      firstPlan: false,
      activePlan: true,
      id: 'test-plan-id',
      active: true,
      organization_id: mockOrg.id,
      name: mockOrg.name
    });
  });

  test('should handle organizations with no reward programs active', async () => {
    // Arrange
    const orgId = 'test-org-id';
    const userId = 'test-user-id';
    const event = createMockEvent({ org_id: orgId }, userId);

    // Mock organization retrieval with no active reward programs
    const mockOrg = {
      id: orgId,
      name: 'Test Organization',
      rl_active: false,
      rm_active: false
    };

    ddbMock.on(GetCommand, {
      TableName: 'test-org-table',
      Key: { id: orgId },
      ProjectionExpression: "id, name, description, images",
    }).resolves({
      Item: mockOrg
    });

    // Mock plan retrieval
    ddbMock.on(GetCommand, {
      TableName: 'test-plans-table',
      Key: {
        PK: `USER#${userId}`,
        SK: `ORG#${orgId}`
      }
    }).resolves({
      Item: undefined
    });

    // Act
    const result = await handler(event);

    // Assert
    expect(result.statusCode).toBe(200);
    const plan = JSON.parse(result.body);
    expect(plan.reward_plan.rewards_loyalty).toBeUndefined();
    expect(plan.reward_plan.rewards_milestone).toBeUndefined();
    expect(plan.rl_active).toBe(false);
    expect(plan.rm_active).toBe(false);
  });

  test('should handle partial plan data', async () => {
    // Arrange
    const orgId = 'test-org-id';
    const userId = 'test-user-id';
    const event = createMockEvent({ org_id: orgId }, userId);

    // Mock organization retrieval
    const mockOrg = {
      id: orgId,
      name: 'Test Organization',
      rl_active: true,
      rewards_loyalty: {
        reward_type: 'points',
        points_per_visit: 10
      }
    };

    ddbMock.on(GetCommand, {
      TableName: 'test-org-table',
      Key: { id: orgId },
      ProjectionExpression: "id, name, description, images",
    }).resolves({
      Item: mockOrg
    });

    const mockPlan = {
      id: 'test-plan-id',
      active: true
    };

    ddbMock.on(GetCommand, {
      TableName: 'test-plans-table',
      Key: {
        PK: `USER#${userId}`,
        SK: `ORG#${orgId}`
      }
    }).resolves({
      Item: mockPlan
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const plan = JSON.parse(result.body);
    expect(plan.visits).toBe(0);
    expect(plan.points).toBe(0);
    expect(plan.redeemableRewards).toEqual([]);
  });

  test('should handle database errors gracefully', async () => {
    const event = createMockEvent({ org_id: 'test-org-id' }, 'test-user-id');

    ddbMock.on(GetCommand).rejects(new Error('Database connection failed'));

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await handler(event);

    // Assert
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Could not retrieve shop plan');
    expect(consoleErrorSpy).toHaveBeenCalled();

    // Restore console.error
    consoleErrorSpy.mockRestore();
  });
});