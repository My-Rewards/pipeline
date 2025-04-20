import { bool } from "aws-sdk/clients/signer";
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
    search_name:string;
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

export interface ShopHour {
    day: string;
    open: string | null;
    close: string | null;
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

export interface RMProps {
    expenditure: number;
    rewardsOptions: string[];
};

export interface Tier {
    id: string;
    rewards: string[];
}
export interface RLProps{
    [tier: number]: Tier;
};
  
export interface RewardSystem {
    rewards_loyalty?: RLProps
    rewards_milestone?: RMProps
}

export interface PlanProps {
    id:string,
    user_id: string,
    org_id: string,
    start_date: string,
    visits:number,
    visits_total:number,
    points:number,
    points_total:number
}

export interface ShopProps {
    id: string; 
    orgId: string; // We need to stop mixing snake and camel case
    name:string;
    banner: string;
    logo:string;
    favorite:boolean;
    menu:string|undefined;
    phoneNumber:string;
    description:string;
    shop_hours: ShopHour[];
    location:{
      city:string,
      state:string,
      address:string
    };
    latitude: number;
    longitude: number;
    square_location_id: string
}

export interface VisitProps {
    id?: string,
    user_id: string,
    order_id: string,
    org_id: string,
    shop_id: string,
    visitTimestamp: string,
    total: bigint | null,
    rl_active: bool, // if org loyalty rewards were active at time of visit
    rm_active: bool // if org milestone rewards were active at time of visit
}