const mockStripeInstance = {
    customers: {
        create: jest.fn().mockResolvedValue({ id: "cus_test123" }),
    },
};

const mockStripe = jest.fn().mockImplementation(() => mockStripeInstance);

export default mockStripe;
export { mockStripeInstance };