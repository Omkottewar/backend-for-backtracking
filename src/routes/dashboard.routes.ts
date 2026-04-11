import { Router } from "express";
import { getDashboard } from "../controllers/dashboard.controller";
import { authenticateToken } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticateToken);

router.get("/", getDashboard);

export default router;