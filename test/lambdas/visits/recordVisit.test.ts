/*

import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';
import { _test } from '../../../lambda/visit/recordVisit';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
// __mocks__/aws-sdk.ts or inside your test file

import { mockClient } from 'aws-sdk-client-mock';

// Create a mock of DynamoDBClient
const ddbMock = mockClient(DynamoDBClient);

// Optional: mock specific commands (example)
ddbMock.on(PutCommand).resolves({});
ddbMock.on(UpdateCommand).resolves({});

const kmsMock = mockClient(KMSClient);
kmsMock.on(DecryptCommand).resolves({ Plaintext: Buffer.from('decrypted-value') });

// Export for use in your test file if needed
export { ddbMock, kmsMock };

describe('recordVisit Lambda Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Test validateEnvVariables
    describe('validateEnvVariables', () => {
        it('should throw an error if required environment variables are missing', () => {
            process.env.SHOPS_TABLE = undefined;
            process.env.ORGANIZATIONS_TABLE = undefined;

            expect(() => _test.validateEnvVariables()).toThrow(
                'Missing required environment variables'
            );
        });

        it('should not throw an error if all required environment variables are set', () => {
            process.env.SHOPS_TABLE = 'ShopsTable';
            process.env.ORGANIZATIONS_TABLE = 'OrganizationsTable';
            process.env.PLANS_TABLE = 'PlansTable';
            process.env.VISITS_TABLE = 'VisitsTable';
            process.env.APP_ENV = 'beta'

            expect(() => _test.validateEnvVariables()).not.toThrow();
        });
    });

    // Test parseAndValidateInput
    describe('parseAndValidateInput', () => {
        it('should throw an error if required attributes are missing', () => {
            const event = {
                queryStringParameters: {},
            } as unknown as APIGatewayProxyEvent;

            expect(() => _test.parseAndValidateInput(event)).toThrow(
                'Missing required attributes: user_id, shop_id, timestamp'
            );
        });

        it('should return parsed input if all attributes are present', () => {
            const event = {
                queryStringParameters: {
                    user_id: '123',
                    shop_id: '456',
                    timestamp: '2025-04-02T00:00:00Z',
                },
            } as unknown as APIGatewayProxyEvent;

            const result = _test.parseAndValidateInput(event);
            expect(result).toEqual({
                user_id: '123',
                shop_id: '456',
                timestamp: '2025-04-02T00:00:00Z',
            });
        });
    });

    // Test getShop
    describe('getShop', () => {
        it('should return the shop if it exists', async () => {
            const mockShop = { Item: {id: 'shop-123', name: 'Test Shop' }}
            ddbMock.on(GetCommand).resolves(mockShop);

            const result = await _test.getShop('shop-123');
            expect(result).toEqual(mockShop);
            expect(ddbMock.send).toHaveBeenCalledWith(expect.any(GetCommand));
        });

        it('should throw an error if the shop does not exist', async () => {
            ddbMock.on(GetCommand).resolves({});

            await expect(_test.getShop('shop-123')).rejects.toThrow(
                "Shop with id 'shop-123' not found"
            );
        });

        it('should throw an error if DynamoDB fails', async () => {
            ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));

            await expect(_test.getShop('shop-123')).rejects.toThrow(
                `Shop with id 'shop-123' not found`
            );
        });
    });

    // Test decryptToken
    describe('decryptToken', () => {
        it('should return the decrypted token', async () => {
            const mockDecryptedToken = 'decrypted-token';
            mockKmsClient.send = jest.fn().mockResolvedValue({
                Plaintext: Buffer.from(mockDecryptedToken),
            });

            const result = await _test.decryptToken('encrypted-token');
            expect(result).toBe(mockDecryptedToken);
            expect(mockKmsClient.send).toHaveBeenCalledWith(expect.any(DecryptCommand));
        });

        it('should throw an error if decryption fails', async () => {
            mockKmsClient.send = jest.fn().mockRejectedValue(new Error('KMS error'));

            await expect(_test.decryptToken('encrypted-token')).rejects.toThrow(
                'Failed to decrypt square oauth token'
            );
        });
    });

    // Test recordVisit
    describe('recordVisit', () => {
        it('should record the visit and return the visit ID', async () => {
            const mockVisitId = 'visit-123';
            mockDynamoDb.send = jest.fn().mockResolvedValue({});

            const result = await _test.recordVisit('user-123', { id: 'order-123' }, { id: 'shop-123' });
            expect(result).toBe(mockVisitId);
            expect(mockDynamoDb.send).toHaveBeenCalledWith(expect.any(PutCommand));
        });

        it('should throw an error if DynamoDB fails', async () => {
            mockDynamoDb.send = jest.fn().mockRejectedValue(new Error('DynamoDB error'));

            await expect(_test.recordVisit('user-123', { id: 'order-123' }, { id: 'shop-123' })).rejects.toThrow(
                'Failed to record visit in DynamoDB'
            );
        });
    });

    // Test recordLoyaltyReward
    describe('recordLoyaltyReward', () => {
        it('should update an existing loyalty plan', async () => {
            const mockLoyaltyPlan = { PK: 'user-123', SK: 'shop-123#LOYALTY', currentValue: 5 };
            mockDynamoDb.send = jest.fn()
                .mockResolvedValueOnce({ Item: mockLoyaltyPlan }) // GetCommand
                .mockResolvedValueOnce({}); // UpdateCommand

            await _test.recordLoyaltyReward('user-123', 'visit-123', {}, { id: 'shop-123' }, { rl_active: true });
            expect(mockDynamoDb.send).toHaveBeenCalledTimes(2);
            expect(mockDynamoDb.send).toHaveBeenCalledWith(expect.any(UpdateCommand));
        });

        it('should create a new loyalty plan if none exists', async () => {
            mockDynamoDb.send = jest.fn()
                .mockResolvedValueOnce({ Item: undefined }) // GetCommand
                .mockResolvedValueOnce({}); // PutCommand

            await _test.recordLoyaltyReward('user-123', 'visit-123', {}, { id: 'shop-123' }, { rl_active: true });
            expect(mockDynamoDb.send).toHaveBeenCalledTimes(2);
            expect(mockDynamoDb.send).toHaveBeenCalledWith(expect.any(PutCommand));
        });
    });

    // Test recordExpenditureReward
    describe('recordExpenditureReward', () => {
        it('should update an existing expenditure plan', async () => {
            const mockExpenditurePlan = { PK: 'user-123', SK: 'shop-123#EXPENDITURE', currentValue: 50 };
            mockDynamoDb.send = jest.fn()
                .mockResolvedValueOnce({ Item: mockExpenditurePlan }) // GetCommand
                .mockResolvedValueOnce({}); // UpdateCommand

            await _test.recordExpenditureReward('user-123', 'visit-123', { netAmounts: { totalMoney: { amount: 1000 } } }, { id: 'shop-123' }, { rm_active: true });
            expect(mockDynamoDb.send).toHaveBeenCalledTimes(2);
            expect(mockDynamoDb.send).toHaveBeenCalledWith(expect.any(UpdateCommand));
        });

        it('should create a new expenditure plan if none exists', async () => {
            mockDynamoDb.send = jest.fn()
                .mockResolvedValueOnce({ Item: undefined }) // GetCommand
                .mockResolvedValueOnce({}); // PutCommand

            await _test.recordExpenditureReward('user-123', 'visit-123', { netAmounts: { totalMoney: { amount: 1000 } } }, { id: 'shop-123' }, { rm_active: true });
            expect(mockDynamoDb.send).toHaveBeenCalledTimes(2);
            expect(mockDynamoDb.send).toHaveBeenCalledWith(expect.any(PutCommand));
        });
    });

});*/
