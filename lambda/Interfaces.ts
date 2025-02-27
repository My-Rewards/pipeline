export interface OrganizationProps {
    id: string;
    owner_id: string;
    stripe_id: string | null;
    accessToken: string | null;
    refreshToken: string | null;
    updatedAt: string | null;
    expiresAt: string | null;
    square_merchant_id: string | null;
    date_registered: string;
    lastUpdate: string;
    rewards_loyalty: unknown;
    rewards_milestone: unknown;
    members: string[];
    name: string;
    description: string;
    rl_active: boolean;
    rm_active: boolean;
    active:boolean;
    images: {
        logo: string;
        preview: string;
        banner: string;
    };
    linked: boolean;
}

export interface ShopProps {
    id: string;
    org_id: string;
}
