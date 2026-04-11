import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import prisma from '../utils/prisma';

export const createTrip = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

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

    if (
      !flightNumber ||
      !airlineName ||
      !departureAirport ||
      !destinationAirport ||
      !departureDate ||
      !departureTime ||
      !arrivalDate ||
      !arrivalTime
    ) {
      return res.status(400).json({ message: "Missing required trip fields" });
    }

    const departureDateTime = new Date(`${departureDate}T${departureTime}`);
    const arrivalDateTime = new Date(`${arrivalDate}T${arrivalTime}`);

    if (isNaN(departureDateTime.getTime()) || isNaN(arrivalDateTime.getTime())) {
      return res.status(400).json({ message: "Invalid date/time format" });
    }

    let parsedBags: any[] = [];

    try {
      parsedBags = bags ? JSON.parse(bags) : [];
    } catch {
      return res.status(400).json({ message: "Invalid bags JSON format" });
    }

    if (parsedBags.length === 0) {
      return res.status(400).json({
        message: "Trip must contain at least one bag"
      });
    }

    const files = (req.files as Express.Multer.File[]) || [];

    const result = await prisma.$transaction(async (tx) => {

      const trip = await tx.trip.create({
        data: {
          userId: req.user!.id,
          flightNumber,
          airlineName,
          departureAirport,
          destinationAirport,
          departureDateTime,
          arrivalDateTime
        }
      });

      const createdBags = [];

      for (let i = 0; i < parsedBags.length; i++) {

        const bagData = parsedBags[i];

        const file = files.find(f => f.fieldname === `image_${i}`);

        const imagePath = file ? `/uploads/${file.filename}` : null;

        const bag = await tx.bag.create({
          data: {
            tripId: trip.id,
            tagNumber: bagData.tagNumber,
            weightLbs: Number(bagData.weight),
            description: bagData.description ?? "",
            imagePath
          }
        });

        await tx.trackingLog.create({
          data: {
            bagId: bag.id,
            status: "Checked-in",
            airportLocation: departureAirport,
            remarks: "Bag checked in during trip creation"
          }
        });

        createdBags.push(bag);
      }

      return { trip, bags: createdBags };
    });

    return res.status(201).json({
      message: "Trip created successfully",
      data: result
    });

  } catch (error: any) {

    console.error("createTrip error:", error);

    return res.status(500).json({
      message: "Failed to create trip",
      error: error.message
    });

  }
};

export const getTrips = async (req: AuthRequest, res: Response) => {
  try {

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const trips = await prisma.trip.findMany({
      where: {
        userId: req.user.id
      },
      include: {
        bags: {
          include: {
            trackingLogs: {
              orderBy: { timestamp: "desc" },
              take: 1
            }
          }
        }
      },
      orderBy: {
        departureDateTime: "desc"
      }
    });

    return res.status(200).json({
      data: trips
    });

  } catch (error: any) {

    console.error("getTrips error:", error);

    return res.status(500).json({
      message: "Failed to fetch trips",
      error: error.message
    });

  }
};

export const getTripById = async (req: AuthRequest, res: Response) => {
  try {

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;

    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        bags: {
          include: {
            trackingLogs: {
              orderBy: { timestamp: "desc" }
            }
          }
        }
      }
    });

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    if (trip.userId !== req.user.id && req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.status(200).json({
      data: trip
    });

  } catch (error: any) {

    console.error("getTripById error:", error);

    return res.status(500).json({
      message: "Failed to fetch trip",
      error: error.message
    });

  }
};
