import { Router } from 'express';
import express from 'express';
import { stripeWebhook } from '../controllers/subscription.controller';

const router = Router();

// Stripe requires raw body for signature verification.
router.post('/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

export default router;

