import Stripe from "stripe";

export interface OrganizationProps {
    id: string;
    stripe_id: string | null;
    accessToken: string | null;
    refreshToken: string | null;
    updatedAt: string | null;
    expiresAt: string | null;
    square_merchant_id: string | null;
    tags:Set<string>;
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
        logo:{
            url:string,
            fileKey:string,
        }
        preview:{
            url:string,
            fileKey:string,
        }
        banner:{
            url:string,
            fileKey:string,
        }
    };
    linked: boolean;
}

export interface ShopProps {
    id: string;
    orgId: string;
}

export interface StripeInvoice {
    id?: string;
    total: number;
    amount_due: number;
    created: number;
    period_start: number;
    period_end: number;
    download:string|null;
    upcoming: boolean;
    paid:boolean
}

export interface StripeBillingProps {
    total: number | null;
    tax: number | null;
    active: boolean;
    currPaymentMethod: string | null;
    paymentWindow: {
        start: number | null;
        end: number | null;
    };
    invoices: StripeInvoice[];
    paymentMethods: Stripe.PaymentMethod[];
}