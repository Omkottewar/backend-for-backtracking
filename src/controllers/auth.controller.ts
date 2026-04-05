import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import prisma from '../utils/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'supers3cr3tjwtk3y';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

export const register = async (req: Request, res: Response) => {
  try {
    const {
      fullName, email, phone, address, state, city, country, identificationNo, password
    } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        fullName,
        email,
        phone,
        address,
        state,
        city,
        country: country || 'United States',
        identificationNo,
        passwordHash,
      }
    });

    const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      user: {
        id: newUser.id,
        fullName: newUser.fullName,
        email: newUser.email,
        phone: newUser.phone,
        address: newUser.address,
        city: newUser.city,
        state: newUser.state,
        country: newUser.country,
        identificationNo: newUser.identificationNo,
        profilePicUrl: newUser.profilePicUrl,
        role: newUser.role,
      },
      token
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error during registration', error: error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!password) return res.status(400).json({ message: 'Password is required' });

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(200).json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        city: user.city,
        state: user.state,
        country: user.country,
        identificationNo: user.identificationNo,
        profilePicUrl: user.profilePicUrl,
        role: user.role,
      },
      token
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error during login', error: error.message });
  }
};

export const getProfile = async (req: any, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        city: user.city,
        state: user.state,
        country: user.country,
        identificationNo: user.identificationNo,
        profilePicUrl: user.profilePicUrl,
        role: user.role,
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Server Error getting profile', error: error.message });
  }
};

export const updateProfile = async (req: any, res: Response) => {
  try {
    const { fullName, phone, address, state, city, identificationNo } = req.body;
    const profilePicUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

    const dataToUpdate: any = { fullName, phone, address, state, city, identificationNo };
    if (profilePicUrl) {
        dataToUpdate.profilePicUrl = profilePicUrl;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: dataToUpdate
    });

    res.status(200).json({
      user: {
        id: updatedUser.id,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        phone: updatedUser.phone,
        address: updatedUser.address,
        city: updatedUser.city,
        state: updatedUser.state,
        country: updatedUser.country,
        identificationNo: updatedUser.identificationNo,
        profilePicUrl: updatedUser.profilePicUrl,
        role: updatedUser.role,
      },
      message: 'Profile updated successfully'
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(200).json({ message: 'If the email exists, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry }
    });

    const resetLink = `${APP_URL}/reset-password?token=${token}`;
    await transporter.sendMail({
      from: process.env.MAIL_FROM || 'no-reply@baggagetrack.local',
      to: email,
      subject: 'BaggageTrack Password Reset',
      html: `<p>You requested a password reset.</p><p>Use this link within 15 minutes: <a href="${resetLink}">${resetLink}</a></p>`
    });

    return res.status(200).json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to send reset email', error: error.message });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    const user = await prisma.user.findFirst({
      where: { resetToken: token, resetTokenExpiry: { gt: new Date() } }
    });
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null }
    });

    return res.status(200).json({ message: 'Password reset successful' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to reset password', error: error.message });
  }
};
