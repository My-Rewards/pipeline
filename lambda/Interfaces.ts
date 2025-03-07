import Stripe from "stripe";

export interface OrganizationProps {
    id: string;
    stripe_id: string | null;
    accessToken: string | null;
    refreshToken: string | null;
    updatedAt: string | null;
    expiresAt: string | null;
    square_merchant_id: string | null;
    owner_id:string;
    date_registered: string;
    lastUpdate: string;
    rewards_loyalty: unknown;
    rewards_milestone: unknown;
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

export interface StripeBillingProps{
    total:number|null,
    tax:number|null,
    active:boolean,
    currPaymentMethod: string | null
    paymentWindow:{
        start:number | null,
        end:number | null
    },
    invoices:Stripe.Invoice[]
    paymentMethods:Stripe.PaymentMethod[]
}
