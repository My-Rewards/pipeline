import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { mockClient } from "aws-sdk-client-mock";
import { fetchSquareSecret } from "../../../lambda/constants/square";
const secretsManagerMock = mockClient(SecretsManagerClient);

describe("fetchSquareSecret", () => {
    beforeEach(() => {
        secretsManagerMock.reset();
    });

    test("should return client ID and secret when secret exists", async () => {
        const mockSecretString = JSON.stringify({
            client_id: "test-client-id",
            client_secret: "test-client-secret"
        });

        secretsManagerMock.on(GetSecretValueCommand).resolves({
            SecretString: mockSecretString
        });

        const secretARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:test/square/key";
        const result = await fetchSquareSecret(secretARN);

        expect(result).toEqual({
            client: "test-client-id",
            secret: "test-client-secret"
        });

        expect(secretsManagerMock.calls()).toHaveLength(1);
        const secretsManagerCall = secretsManagerMock.call(0);
        expect(secretsManagerCall.args[0].input).toEqual({
            SecretId: secretARN
        });
    });

    test("should throw error when SecretString is not available", async () => {
        secretsManagerMock.on(GetSecretValueCommand).resolves({
            SecretString: undefined
        });

        const secretARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:test/square/key";

        await expect(fetchSquareSecret(secretARN)).rejects.toThrow(
            "Square key not found in Secrets Manager."
        );
    });

    test("should throw error when AWS Secrets Manager request fails", async () => {
        secretsManagerMock.on(GetSecretValueCommand).rejects(
            new Error("Service unavailable")
        );

        const secretARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:test/square/key";

        await expect(fetchSquareSecret(secretARN)).rejects.toThrow(
            "Service unavailable"
        );
    });

    test("should throw error when secret JSON is invalid", async () => {
        secretsManagerMock.on(GetSecretValueCommand).resolves({
            SecretString: "{invalid-json"
        });

        const secretARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:test/square/key";

        await expect(fetchSquareSecret(secretARN)).rejects.toThrow();
    });

    test("should throw error when secret is missing required fields", async () => {
        const mockSecretString = JSON.stringify({
            other_field: "some value"
        });

        secretsManagerMock.on(GetSecretValueCommand).resolves({
            SecretString: mockSecretString
        });

        const secretARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:test/square/key";

        const result = await fetchSquareSecret(secretARN);
        expect(result.client).toBeUndefined();
        expect(result.secret).toBeUndefined();
    });
});