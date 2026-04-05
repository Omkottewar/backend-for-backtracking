import { Router } from 'express';
import { addTrackingEvent, getBagTimeline, getTrackingByTag } from '../controllers/tracking.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.post('/', addTrackingEvent);
router.get('/by-tag/:tag', getTrackingByTag);
router.get('/:bagId', getBagTimeline);

export default router;
