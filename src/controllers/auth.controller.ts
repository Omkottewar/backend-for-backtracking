import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { body, validationResult } from 'express-validator';
import prisma from '../utils/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'supers3cr3tjwtk3y';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// ─────────────────────────────────────────────
//  VALIDATION RULE SETS  (use as middleware)
// ─────────────────────────────────────────────

export const registerValidation = [
  body('fullName')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be 2–100 characters'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Enter a valid email address')
    .normalizeEmail(),

  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^\+1\d{10}$/).withMessage('Phone must be a valid US number (+1XXXXXXXXXX)'),

  body('address')
    .trim()
    .notEmpty().withMessage('Address is required')
    .isLength({ max: 255 }).withMessage('Address is too long'),

  body('city')
    .trim()
    .notEmpty().withMessage('City is required')
    .isLength({ max: 100 }).withMessage('City is too long'),

  body('state')
    .trim()
    .notEmpty().withMessage('State is required')
    .isLength({ min: 2, max: 100 }).withMessage('State is invalid'),

  body('zip')
    .trim()
    .notEmpty().withMessage('ZIP code is required')
    .matches(/^\d{5}(-\d{4})?$/).withMessage('ZIP code must be 5 digits (or ZIP+4)'),

  body('identificationNo')
    .trim()
    .notEmpty().withMessage('SSN / Identification number is required')
    .matches(/^\d{3}-?\d{2}-?\d{4}$/).withMessage('SSN must be in XXX-XX-XXXX format'),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/\d/).withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character'),

  body('country')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Country is invalid'),
];

export const loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Enter a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required'),
];

export const requestResetValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Enter a valid email address')
    .normalizeEmail(),
];

export const resetPasswordValidation = [
  body('token')
    .trim()
    .notEmpty().withMessage('Reset token is required'),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/\d/).withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character'),
];

// ─────────────────────────────────────────────
//  HELPER  — extract & return validation errors
// ─────────────────────────────────────────────

const handleValidationErrors = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({
      message: 'Validation failed',
      errors: errors.array().map((e) => ({ field: e.type === 'field' ? (e as any).path : 'unknown', message: e.msg })),
    });
    return true; // signals that we already responded
  }
  return false;
};

// ─────────────────────────────────────────────
//  CONTROLLERS
// ─────────────────────────────────────────────

export const register = async (req: Request, res: Response) => {
  if (handleValidationErrors(req, res)) return;

  try {
    const {
      fullName, email, phone, address, state, city, zip, country, identificationNo, password,
    } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12); // bumped to 12 rounds

    const newUser = await prisma.user.create({
      data: {
        fullName,
        email,
        phone,
        address,
        state,
        city,
        zip,                          // ← was missing before
        country: country || 'USA',
        identificationNo,
        passwordHash,
      },
    });

    const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      message: 'Account created successfully',
      user: sanitizeUser(newUser),
      token,
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Server error during registration', error: error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  if (handleValidationErrors(req, res)) return;

  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    // Always compare to prevent timing attacks even when user not found
    const dummyHash = '$2a$12$invalidhashusedtopreventimaginarytiminglakjdhfkajhsdf';
    const isMatch = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, dummyHash);

    if (!user || !isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      message: 'Login successful',
      user: sanitizeUser(user),
      token,
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Server error during login', error: error.message });
  }
};

export const getProfile = async (req: any, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json({ user: sanitizeUser(user) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Server error getting profile', error: error.message });
  }
};
// AFTER
export const updateProfile = async (req: any, res: Response) => {
  try {
    const { fullName, phone, address, state, city, zip } = req.body;
   const profilePicUrl = req.file ? req.file.path : undefined;

    // Only include a field if it was actually sent in the request
    const dataToUpdate: Record<string, any> = {};
    if (fullName !== undefined)  dataToUpdate.fullName  = fullName;
    if (phone !== undefined)     dataToUpdate.phone     = phone;
    if (address !== undefined)   dataToUpdate.address   = address;
    if (state !== undefined)     dataToUpdate.state     = state;
    if (city !== undefined)      dataToUpdate.city      = city;
    if (zip !== undefined)       dataToUpdate.zip       = zip;
    if (profilePicUrl)           dataToUpdate.profilePicUrl = profilePicUrl;

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: dataToUpdate,   // now only contains what was actually sent
    });

    return res.status(200).json({
      message: 'Profile updated successfully',
      user: sanitizeUser(updatedUser),
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
};

// ─────────────────────────────────────────────
//  PASSWORD RESET
// ─────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

export const requestPasswordReset = async (req: Request, res: Response) => {
  if (handleValidationErrors(req, res)) return;

  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return same message to prevent email enumeration
    if (!user) {
      return res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    });

    const resetLink = `${APP_URL}/reset-password?token=${token}`;

    await transporter.sendMail({
      from: process.env.MAIL_FROM || 'no-reply@baggagetrack.local',
      to: email,
      subject: 'SmartBag Password Reset',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;">
          <h2>Password Reset Request</h2>
          <p>We received a request to reset your password. This link expires in <strong>15 minutes</strong>.</p>
          <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#1a73e8;color:#fff;border-radius:8px;text-decoration:none;">Reset Password</a>
          <p style="margin-top:24px;color:#888;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    return res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to send reset email', error: error.message });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  if (handleValidationErrors(req, res)) return;

  try {
    const { token, password } = req.body;

    const user = await prisma.user.findFirst({
      where: { resetToken: token, resetTokenExpiry: { gt: new Date() } },
    });

    if (!user) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null },
    });

    return res.status(200).json({ message: 'Password reset successful. You can now log in.' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to reset password', error: error.message });
  }
};

// ─────────────────────────────────────────────
//  HELPER — strip sensitive fields from user
// ─────────────────────────────────────────────

function sanitizeUser(user: any) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    address: user.address,
    city: user.city,
    state: user.state,
    zip: user.zip,
    country: user.country,
    identificationNo: user.identificationNo,
    profilePicUrl: user.profilePicUrl,
    role: user.role,
  };
}