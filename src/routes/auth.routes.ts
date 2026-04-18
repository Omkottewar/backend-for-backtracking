import { Router } from 'express';
import { register, login, getProfile, updateProfile, requestPasswordReset, resetPassword } from '../controllers/auth.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'profile-pictures',     // folder name in your Cloudinary account
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill' }], // auto resize
  } as any,
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, (req, res, next) => {
  upload.single('profilePic')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err); // this will show the REAL error in your terminal
      return res.status(400).json({ message: err.message || 'Upload failed' });
    }
    next();
  });
}, updateProfile);

export default router;
