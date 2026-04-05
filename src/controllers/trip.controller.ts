import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import prisma from '../utils/prisma';

export const createTrip = async (req: AuthRequest, res: Response) => {
  try {
    const {
      flightNumber,
      airlineName,
      departureAirport,
      destinationAirport,
      departureDate,
      departureTime,
      arrivalDate,
      arrivalTime,
      bags
    } = req.body;
    
    if (!req.user) {
        console.log('[DEBUG] createTrip: Unauthorized (no req.user)');
        return res.status(401).json({ message: 'Unauthorized' });
    }

    let parsedBags: any[] = [];
    try {
        if (bags) parsedBags = JSON.parse(bags);
    } catch(e) {}
    
    if (!parsedBags || parsedBags.length === 0) {
        return res.status(400).json({ message: 'At least one bag is required to create a trip.' });
    }

    const departureDateTime = new Date(`${departureDate}T${departureTime}`);
    const arrivalDateTime = new Date(`${arrivalDate}T${arrivalTime}`);
    if (isNaN(departureDateTime.getTime()) || isNaN(arrivalDateTime.getTime())) {
      return res.status(400).json({ message: 'Invalid departure or arrival date/time' });
    }

    const trip = await prisma.trip.create({
      data: {
        userId: req.user.id,
        flightNumber,
        airlineName,
        departureAirport,
        destinationAirport,
        departureDateTime,
        arrivalDateTime,
      }
    });

    const files = req.files as any[] || [];

    for (let i = 0; i < parsedBags.length; i++) {
        const bagData = parsedBags[i];
        const file = files.find(f => f.fieldname === `image_${i}`);
        const imagePath = file ? `/uploads/${file.filename}` : null;

        const newBag = await prisma.bag.create({
            data: {
                tripId: trip.id,
                tagNumber: bagData.tagNumber,
                weightLbs: parseFloat(bagData.weight),
                description: bagData.description || '',
                imagePath: imagePath
            }
        });

        await prisma.trackingLog.create({
            data: {
                bagId: newBag.id,
                status: 'Checked-in',
                airportLocation: departureAirport,
                remarks: 'Bag checked in during trip creation.'
            }
        });
    }

    res.status(201).json({ trip, message: 'Trip and bags created successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating trip', error: error.message });
  }
};

export const getTrips = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const trips = await prisma.trip.findMany({
      where: { userId: req.user.id },
      include: { bags: true },
      orderBy: { departureDateTime: 'desc' }
    });

    res.status(200).json({ trips });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching trips', error: error.message });
  }
};

export const getTripById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const trip = await prisma.trip.findUnique({
      where: { id },
      include: { 
        bags: {
            include: { trackingLogs: { orderBy: { timestamp: 'desc' } } }
        } 
      }
    });

    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    if (trip.userId !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Forbidden' });
    }

    res.status(200).json({ trip });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching trip', error: error.message });
  }
};
