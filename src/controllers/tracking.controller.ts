import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import prisma from '../utils/prisma';

export const addTrackingEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { bagId, status, airportLocation, remarks } = req.body;
    
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Only admins can add tracking events' });

    const bag = await prisma.bag.findUnique({
      where: { id: bagId },
      include: { trip: true }
    });

    if (!bag) return res.status(404).json({ message: 'Bag not found' });

    const newEvent = await prisma.trackingLog.create({
      data: {
        bagId,
        status,
        airportLocation,
        remarks
      }
    });

    // Create Notification for the user
    await prisma.notification.create({
        data: {
            userId: bag.trip.userId,
            bagId: bag.id,
            message: `Your bag (${bag.tagNumber}) status changed to ${status}${airportLocation ? ` at ${airportLocation}` : ''}.`,
            type: 'BAGGAGE_UPDATE'
        }
    });

    res.status(201).json({ event: newEvent });
  } catch (error: any) {
    res.status(500).json({ message: 'Error adding tracking event', error: error.message });
  }
};

export const getBagTimeline = async (req: AuthRequest, res: Response) => {
  try {
    const { bagId } = req.params;
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const bag = await prisma.bag.findUnique({
      where: { id: bagId },
      include: { trip: true }
    });
    if (!bag) return res.status(404).json({ message: 'Bag not found' });
    if (bag.trip.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const events = await prisma.trackingLog.findMany({
      where: { bagId },
      orderBy: { timestamp: 'asc' }
    });

    res.status(200).json({ events });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching timeline', error: error.message });
  }
};

export const getTrackingByTag = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { tag } = req.params;
    const bag = await prisma.bag.findUnique({
      where: { tagNumber: tag },
      include: { trip: true }
    });
    if (!bag) return res.status(404).json({ message: 'Bag not found' });
    if (bag.trip.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const events = await prisma.trackingLog.findMany({
      where: { bagId: bag.id },
      orderBy: { timestamp: 'asc' }
    });
    return res.status(200).json({ bag, events });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error fetching tracking details', error: error.message });
  }
};
