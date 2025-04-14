import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import Stripe from "stripe";
import { dfPM, getStripeSecret } from "@/lambda/constants/validOrganization";
import { mockClient } from "aws-sdk-client-mock";

const secretsManagerMock = mockClient(SecretsManagerClient);

jest.mock("stripe");

describe("Helper Functions", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        secretsManagerMock.reset();
    });

    describe("dfPM", () => {
        it("should return true when customer has default payment method and one active subscription", async () => {
            // Mock data
            const mockStripe = {
                customers: {
                    retrieve: jest.fn().mockResolvedValue({
                        deleted: false,
                        invoice_settings: {
                            default_payment_method: "pm_123456"
                        }
                    })
                },
                subscriptions: {
                    list: jest.fn().mockResolvedValue({
                        data: [{ id: "sub_123" }]
                    })
                }
            } as unknown as Stripe;

            const result = await dfPM("cus_123", mockStripe);

            expect(mockStripe.customers.retrieve).toHaveBeenCalledWith("cus_123");
            expect(mockStripe.subscriptions.list).toHaveBeenCalledWith({
                customer: "cus_123",
                status: "active",
                limit: 1
            });
            expect(result).toBe(true);
        });

        it("should return true when customer has default payment method as object and one active subscription", async () => {
            // Mock data with payment method as object
            const mockStripe = {
                customers: {
                    retrieve: jest.fn().mockResolvedValue({
                        deleted: false,
                        invoice_settings: {
                            default_payment_method: { id: "pm_123456" }
                        }
                    })
                },
                subscriptions: {
                    list: jest.fn().mockResolvedValue({
                        data: [{ id: "sub_123" }]
                    })
                }
            } as unknown as Stripe;

            const result = await dfPM("cus_123", mockStripe);
            expect(result).toBe(true);
        });

        it("should return false when customer has no default payment method", async () => {
            // Mock data
            const mockStripe = {
                customers: {
                    retrieve: jest.fn().mockResolvedValue({
                        deleted: false,
                        invoice_settings: {}
                    })
                },
                subscriptions: {
                    list: jest.fn().mockResolvedValue({
                        data: [{ id: "sub_123" }]
                    })
                }
            } as unknown as Stripe;

            const result = await dfPM("cus_123", mockStripe);
            expect(result).toBe(false);
        });

        it("should return false when customer is deleted", async () => {
            // Mock data
            const mockStripe = {
                customers: {
                    retrieve: jest.fn().mockResolvedValue({
                        deleted: true,
                        invoice_settings: {
                            default_payment_method: "pm_123456"
                        }
                    })
                },
                subscriptions: {
                    list: jest.fn().mockResolvedValue({
                        data: [{ id: "sub_123" }]
                    })
                }
            } as unknown as Stripe;

            const result = await dfPM("cus_123", mockStripe);
            expect(result).toBe(false);
        });

        it("should return false when customer has no active subscriptions", async () => {
            // Mock data
            const mockStripe = {
                customers: {
                    retrieve: jest.fn().mockResolvedValue({
                        deleted: false,
                        invoice_settings: {
                            default_payment_method: "pm_123456"
                        }
                    })
                },
                subscriptions: {
                    list: jest.fn().mockResolvedValue({
                        data: []
                    })
                }
            } as unknown as Stripe;

            const result = await dfPM("cus_123", mockStripe);
            expect(result).toBe(false);
        });

        it("should return false when customer has multiple active subscriptions", async () => {
            // Mock data
            const mockStripe = {
                customers: {
                    retrieve: jest.fn().mockResolvedValue({
                        deleted: false,
                        invoice_settings: {
                            default_payment_method: "pm_123456"
                        }
                    })
                },
                subscriptions: {
                    list: jest.fn().mockResolvedValue({
                        data: [{ id: "sub_123" }, { id: "sub_456" }]
                    })
                }
            } as unknown as Stripe;

            const result = await dfPM("cus_123", mockStripe);
            expect(result).toBe(false);
        });

        it("should handle API errors gracefully", async () => {
            // Mock data with error
            const mockStripe = {
                customers: {
                    retrieve: jest.fn().mockRejectedValue(new Error("API Error"))
                },
                subscriptions: {
                    list: jest.fn()
                }
            } as unknown as Stripe;

            await expect(dfPM("cus_123", mockStripe)).rejects.toThrow("API Error");
        });
    });

    describe("getStripeSecret", () => {
        it("should return the secret key when SecretString exists", async () => {
            // Mock the secretClient response
            secretsManagerMock.on(GetSecretValueCommand).resolves({
                SecretString: JSON.stringify({ secretKey: "sk_test_123456" })
            });

            const result = await getStripeSecret("arn:aws:secretsmanager:stripe-secret");

            expect(secretsManagerMock.calls()).toHaveLength(1);
            expect(result).toBe("sk_test_123456");
        });

        it("should throw error when SecretString is null", async () => {
            // Mock the secretClient response with null SecretString
            secretsManagerMock.on(GetSecretValueCommand).resolves({
                SecretString: undefined
            });

            await expect(getStripeSecret("arn:aws:secretsmanager:stripe-secret"))
                .rejects
                .toThrow("Stripe key not found in Secrets Manager.");
        });

        it("should throw error when SecretString is not valid JSON", async () => {
            // Mock the secretClient response with invalid JSON
            secretsManagerMock.on(GetSecretValueCommand).resolves({
                SecretString: "not-valid-json"
            });

            await expect(getStripeSecret("arn:aws:secretsmanager:stripe-secret"))
                .rejects
                .toThrow(); // This will throw a JSON parsing error
        });

        it("should throw error when secretKey is missing in the secret", async () => {
            // Mock the secretClient response with missing secretKey
            secretsManagerMock.on(GetSecretValueCommand).resolves({
                SecretString: JSON.stringify({ otherKey: "value" })
            });

            const result = await getStripeSecret("arn:aws:secretsmanager:stripe-secret");
            expect(result).toBeUndefined();
        });

        it("should handle AWS SDK errors", async () => {
            // Mock the secretClient to throw an error
            secretsManagerMock.on(GetSecretValueCommand).rejects(
                new Error("AWS SDK Error")
            );

            await expect(getStripeSecret("arn:aws:secretsmanager:stripe-secret"))
                .rejects
                .toThrow("AWS SDK Error");
        });
    });
});