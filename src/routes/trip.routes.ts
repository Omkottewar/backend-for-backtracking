import { Router } from 'express';
import { createTrip, getTrips, getTripById } from '../controllers/trip.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { upload } from '../controllers/bag.controller';

const router = Router();

router.use(authenticateToken); // Protect all trip routes

router.post('/', upload.any(), createTrip);
router.get('/', getTrips);
router.get('/:id', getTripById);

export default router;
