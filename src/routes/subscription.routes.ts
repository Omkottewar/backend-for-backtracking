import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.middleware';
import { cancelMySubscription, createCheckoutSession, getMySubscriptionStatus } from '../controllers/subscription.controller';
import { requirePremium } from '../middlewares/premium.middleware';

const router = Router();

router.use(authenticateToken);
router.get('/status', getMySubscriptionStatus);
router.post('/checkout-session', createCheckoutSession);
router.post('/cancel', requirePremium, cancelMySubscription);

export default router;
