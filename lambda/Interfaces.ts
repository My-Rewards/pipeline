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
    reward_plan:RewardSystem,
    visits:number,
    points:number,
    organization_id:string
    rl_active:boolean,
    rm_active:boolean,
    name:string,
    firstPlan:boolean,
    activePlan:boolean,
    redeemableRewards:string[],
    active:boolean
}

export interface ShopProps {
    shop_id: string; 
    organization_id: string; 
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
  }