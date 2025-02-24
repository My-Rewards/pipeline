// __mocks__/stripe.ts
const mockStripeInstance = {
    customers: {
        create: jest.fn().mockResolvedValue({ id: "cus_test123" }),
    },
};

// Default export a Jest function that returns the mock instance
const mockStripe = jest.fn().mockImplementation(() => mockStripeInstance);

export default mockStripe;
export { mockStripeInstance };
