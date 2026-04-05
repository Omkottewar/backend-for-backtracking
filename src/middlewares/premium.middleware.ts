import { Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from './auth.middleware';

export async function requirePremium(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const now = new Date();
    const active = Boolean(user.isPremium && user.expiryDate && user.expiryDate > now);
    if (!active) return res.status(402).json({ message: 'Premium subscription required' });

    return next();
  } catch (e: any) {
    return res.status(500).json({ message: 'Unable to verify premium access' });
  }
}

