import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import prisma from "../utils/prisma";

export const getDashboard = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user.id;
    const now = new Date();

    /* -----------------------------
       TOTAL TRIPS
    ----------------------------- */

    const totalTrips = await prisma.trip.count({
      where: { userId }
    });

    /* -----------------------------
       UPCOMING TRIPS
    ----------------------------- */

    const upcomingTrips = await prisma.trip.count({
      where: {
        userId,
        departureDateTime: {
          gt: now
        }
      }
    });

    /* -----------------------------
       REGISTERED BAGS
    ----------------------------- */

    const registeredBags = await prisma.bag.count({
      where: {
        trip: {
          userId
        }
      }
    });

    /* -----------------------------
       ACTIVE TRACKING
       (bags whose latest status
        is NOT delivered)
    ----------------------------- */

    const bags = await prisma.bag.findMany({
      where: {
        trip: { userId }
      },
      include: {
        trackingLogs: {
          orderBy: { timestamp: "desc" },
          take: 1
        }
      }
    });

    let activeTracking = 0;

    for (const bag of bags) {
      const lastEvent = bag.trackingLogs[0];

      if (lastEvent && lastEvent.status !== "Delivered") {
        activeTracking++;
      }
    }

    /* -----------------------------
       PROGRESS
       % delivered bags
    ----------------------------- */

    const deliveredBags = bags.filter(
      (bag) =>
        bag.trackingLogs[0] &&
        bag.trackingLogs[0].status === "Delivered"
    ).length;

    const progress =
      registeredBags === 0
        ? 0
        : deliveredBags / registeredBags;

    /* -----------------------------
       RESPONSE
    ----------------------------- */

    return res.status(200).json({
      upcomingTrips,
      registeredBags,
      activeTracking,
      totalTrips,
      progress
    });

  } catch (error: any) {
    console.error("Dashboard Error:", error);
    return res.status(500).json({
      message: "Error loading dashboard",
      error: error.message
    });
  }
};