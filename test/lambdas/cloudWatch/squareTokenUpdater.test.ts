import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import * as square from 'square';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../lambda/cloudWatch/squareTokenUpdater'; // Replace with actual path

// Mock the DynamoDB document client
const ddbMock = mockClient(DynamoDBDocumentClient);

// Mock environment variables
const originalEnv = process.env;

describe('Square Token Refresh Lambda', () => {
  let mockSquareObtainToken: jest.SpyInstance;

  beforeEach(() => {
    // Reset mocks before each test
    jest.resetModules();
    ddbMock.reset();

    // Setup environment variables
    process.env = {
      ...originalEnv,
      ORG_TABLE: 'test-org-table',
      ORGANIZATIONS_TABLE: 'test-org-table',
      SQUARE_ARN: 'test-square-arn',
      KMS_KEY_ID: 'test-kms-key-id',
      APP_ENV: 'sandbox',
      SQUARE_CLIENT_ID: 'test-client-id',
      SQUARE_CLIENT_SECRET: 'test-client-secret'
    };

    // Mock Square client's obtainToken method
    mockSquareObtainToken = jest.spyOn(square.SquareClient.prototype.oAuth, 'obtainToken')
        .mockImplementation(() => Promise.resolve({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
        }));
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('should return 500 if square ARN is missing', async () => {
    // Arrange
    process.env.SQUARE_ARN = undefined;

    // Act
    const result = await handler();

    // Assert
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Square ARN required');
  });

  test('should return 500 if APP_ENV is missing', async () => {
    // Arrange
    process.env.APP_ENV = undefined;

    // Act
    const result = await handler();

    // Assert
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Square ARN required');
  });

  test('should return 500 if KMS Key ID is missing', async () => {
    // Arrange
    process.env.KMS_KEY_ID = undefined;

    // Act
    const result = await handler();

    // Assert
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('KMS Key ID is not configured');
  });

  test('should refresh tokens for organizations with expiring tokens', async () => {
    // Arrange
    const twentyThreeHoursFromNow = new Date();
    twentyThreeHoursFromNow.setHours(twentyThreeHoursFromNow.getHours() + 23);

    const mockOrgs = [
      {
        id: 'org-1',
        squareAccessToken: 'old-access-token-1',
        squareTokenExpiration: twentyThreeHoursFromNow.toISOString(),
        squareRefreshToken: 'old-refresh-token-1'
      },
      {
        id: 'org-2',
        squareAccessToken: 'old-access-token-2',
        squareTokenExpiration: twentyThreeHoursFromNow.toISOString(),
        squareRefreshToken: 'old-refresh-token-2'
      }
    ];

    // Mock DynamoDB scan response
    ddbMock.on(ScanCommand).resolves({
      Items: mockOrgs
    });

    // Mock DynamoDB update response
    ddbMock.on(UpdateCommand).resolves({});

    // Act
    const result = await handler();

    // Assert
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Token update process completed successfully');

    // Verify Square client was called with correct parameters for each org
    expect(mockSquareObtainToken).toHaveBeenCalledTimes(2);
    expect(mockSquareObtainToken).toHaveBeenCalledWith({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      grantType: 'refresh_token',
      refreshToken: 'old-refresh-token-1'
    });
    expect(mockSquareObtainToken).toHaveBeenCalledWith({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      grantType: 'refresh_token',
      refreshToken: 'old-refresh-token-2'
    });

    // Verify DynamoDB update was called with correct parameters
    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    expect(updateCalls.length).toBe(2);

    // Check first update
    const firstUpdate = updateCalls[0].args[0].input;
    expect(firstUpdate.TableName).toBe('test-org-table');
    expect(firstUpdate.Key).toEqual({ id: 'org-1' });
    expect(firstUpdate.ExpressionAttributeValues).toBeDefined();
    expect(firstUpdate.ExpressionAttributeValues![':token']).toBe('new-access-token');
    expect(firstUpdate.ExpressionAttributeValues![':refresh']).toBe('new-refresh-token');

    // Check second update
    const secondUpdate = updateCalls[1].args[0].input;
    expect(secondUpdate.TableName).toBe('test-org-table');
    expect(secondUpdate.Key).toEqual({ id: 'org-2' });
  });

  test('should skip organizations with missing token information', async () => {
    // Arrange
    const mockOrgs = [
      {
        id: 'org-1',
        // Missing token information
      },
      {
        id: 'org-2',
        squareAccessToken: 'old-access-token-2',
        // Missing expiration
        squareRefreshToken: 'old-refresh-token-2'
      }
    ];

    // Mock DynamoDB scan response
    ddbMock.on(ScanCommand).resolves({
      Items: mockOrgs
    });

    // Act
    const result = await handler();

    // Assert
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Token update process completed successfully');

    // Verify Square client was not called
    expect(mockSquareObtainToken).not.toHaveBeenCalled();

    // Verify DynamoDB update was not called
    expect(ddbMock.commandCalls(UpdateCommand).length).toBe(0);
  });

  test('should handle Square API errors gracefully', async () => {
    // Arrange
    const twentyThreeHoursFromNow = new Date();
    twentyThreeHoursFromNow.setHours(twentyThreeHoursFromNow.getHours() + 23);

    const mockOrgs = [
      {
        id: 'org-1',
        squareAccessToken: 'old-access-token-1',
        squareTokenExpiration: twentyThreeHoursFromNow.toISOString(),
        squareRefreshToken: 'old-refresh-token-1'
      }
    ];

    // Mock DynamoDB scan response
    ddbMock.on(ScanCommand).resolves({
      Items: mockOrgs
    });

    // Mock Square client to throw an error
    mockSquareObtainToken.mockRejectedValue(new Error('Square API error'));

    // Spy on console.error
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Act
    const result = await handler();

    // Assert
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Token update process completed successfully');

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error refreshing token for organization org-1:'),
        expect.any(Error)
    );

    // Verify no update was performed
    expect(ddbMock.commandCalls(UpdateCommand).length).toBe(0);
  });

  test('should not refresh tokens that are not expiring soon', async () => {
    // Arrange
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const mockOrgs = [
      {
        id: 'org-1',
        squareAccessToken: 'valid-access-token',
        squareTokenExpiration: thirtyDaysFromNow.toISOString(),
        squareRefreshToken: 'valid-refresh-token'
      }
    ];

    // Mock DynamoDB scan response
    ddbMock.on(ScanCommand).resolves({
      Items: mockOrgs
    });

    // Act
    const result = await handler();

    // Assert
    expect(result.statusCode).toBe(200);

    // Verify Square client was not called
    expect(mockSquareObtainToken).not.toHaveBeenCalled();

    // Verify no update was performed
    expect(ddbMock.commandCalls(UpdateCommand).length).toBe(0);
  });

  test('should handle empty result from DynamoDB', async () => {
    // Mock DynamoDB scan to return empty results
    ddbMock.on(ScanCommand).resolves({
      Items: []
    });

    // Act
    const result = await handler();

    // Assert
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Token update process completed successfully');

    // Verify Square client was not called
    expect(mockSquareObtainToken).not.toHaveBeenCalled();

    // Verify no update was performed
    expect(ddbMock.commandCalls(UpdateCommand).length).toBe(0);
  });
});