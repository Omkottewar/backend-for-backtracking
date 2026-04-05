import { Router } from 'express';
import { addBag, getBags, getBagById, deleteBag, upload } from '../controllers/bag.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.post('/', upload.single('image'), addBag);
router.get('/', getBags);
router.get('/:id', getBagById);
router.delete('/:id', deleteBag);

export default router;
