import { Response } from 'express';
import Stripe from 'stripe';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middlewares/auth.middleware';

const getStripeClient = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: '2025-08-27.basil'
  });
};

const PRICE_TO_PLAN: Record<string, { planType: string; months: number }> = {
  // Populated dynamically by frontend priceIds; keep here for mapping only when you use known IDs.
};

function getAppUrl() {
  return process.env.APP_URL || 'http://localhost:5173';
}

function planTypeFromPriceId(priceId: string): { planType: string; months: number } | null {
  // Frontend passes a priceId; we map to a known plan type for storage.
  // You can keep these in env later; for now we infer from your three known durations by looking at env vars.
  const p200 = process.env.STRIPE_PRICE_MONTHLY_200;
  const p400 = process.env.STRIPE_PRICE_QUARTERLY_400;
  const p600 = process.env.STRIPE_PRICE_YEARLY_600;
  if (p200 && priceId === p200) return { planType: 'MONTHLY_200', months: 1 };
  if (p400 && priceId === p400) return { planType: 'QUARTERLY_400', months: 3 };
  if (p600 && priceId === p600) return { planType: 'YEARLY_600', months: 12 };
  return PRICE_TO_PLAN[priceId] || null;
}

export const getMySubscriptionStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const now = new Date();
    const active = Boolean(user.isPremium && user.expiryDate && user.expiryDate > now);
    return res.status(200).json({
      active,
      planType: user.planType,
      subscriptionId: user.subscriptionId,
      expiryDate: user.expiryDate
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Unable to fetch subscription status', error: error.message });
  }
};

export const createCheckoutSession = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(503).json({ message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in backend .env' });
    }

    const { priceId } = req.body as { priceId?: string };
    if (!priceId || typeof priceId !== 'string') return res.status(400).json({ message: 'priceId is required' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    let customerId = user.stripeCustomerId || '';
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.fullName,
        metadata: { userId: user.id }
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId }
      });
    }

    const appUrl = getAppUrl();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/subscription-result?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/subscription-result?canceled=1`,
      client_reference_id: user.id,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          userId: user.id,
          priceId
        }
      },
      metadata: {
        userId: user.id,
        priceId
      }
    });

    return res.status(201).json({ url: session.url });
  } catch (error: any) {
    return res.status(500).json({ message: 'Unable to create checkout session', error: error.message });
  }
};

export const cancelMySubscription = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(503).json({ message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in backend .env' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.subscriptionId) return res.status(400).json({ message: 'No active subscription to cancel' });

    const canceled: any = await stripe.subscriptions.update(user.subscriptionId, { cancel_at_period_end: true });

    return res.status(200).json({
      message: 'Subscription will cancel at period end',
      subscription: {
        id: canceled.id,
        cancel_at_period_end: canceled.cancel_at_period_end,
        current_period_end: canceled.current_period_end
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Unable to cancel subscription', error: error.message });
  }
};

export const stripeWebhook = async (req: any, res: Response) => {
  const stripe = getStripeClient();
  if (!stripe) return res.status(503).json({ message: 'Stripe not configured' });

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(500).json({ message: 'Missing STRIPE_WEBHOOK_SECRET' });
  if (!sig) return res.status(400).json({ message: 'Missing stripe-signature header' });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice: any = event.data.object as any;
        const subscriptionId = (invoice.subscription as string) || '';
        const customerId = (invoice.customer as string) || '';

        // Retrieve subscription for current period end + price id
        const subscription: any = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ['items.data.price']
        });
        const priceId = subscription.items.data[0]?.price?.id || '';
        const mapped = priceId ? planTypeFromPriceId(priceId) : null;
        const expiryDate = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null;

        const userId = (subscription.metadata?.userId as string) || (invoice.metadata?.userId as string) || '';
        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              isPremium: true,
              planType: mapped?.planType || null,
              subscriptionId,
              expiryDate,
              stripeCustomerId: customerId || undefined
            }
          });

          await prisma.subscription.create({
            data: {
              userId,
              planMonths: mapped?.months || 0,
              amount: Math.round(((invoice.amount_paid || 0) / 100) || 0),
              stripePaymentIntentId: invoice.payment_intent ? String(invoice.payment_intent) : `inv_${invoice.id}`,
              status: 'active',
              stripeCustomerId: customerId || undefined,
              stripeSubscriptionId: subscriptionId || undefined,
              currentPeriodEnd: expiryDate || undefined
            }
          }).catch(() => {
            // ignore unique collisions for inv-based ids
          });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice: any = event.data.object as any;
        const subscriptionId = (invoice.subscription as string) || '';
        // Mark premium off on failure (webhook will also handle deleted).
        if (subscriptionId) {
          await prisma.user.updateMany({
            where: { subscriptionId },
            data: { isPremium: false }
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.user.updateMany({
          where: { subscriptionId: sub.id },
          data: {
            isPremium: false,
            planType: null,
            subscriptionId: null,
            expiryDate: null
          }
        });
        break;
      }
      default:
        break;
    }

    return res.json({ received: true });
  } catch (e: any) {
    return res.status(500).json({ message: 'Webhook handler failed', error: e.message });
  }
};
