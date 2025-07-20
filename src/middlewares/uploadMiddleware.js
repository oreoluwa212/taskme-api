const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary with validation
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Log Cloudinary configuration (without secrets) for debugging
console.log('Cloudinary Config Check:', {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Missing',
    api_key: process.env.CLOUDINARY_API_KEY ? 'Set' : 'Missing',
    api_secret: process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Missing'
});

// Test Cloudinary connection
const testCloudinaryConnection = async () => {
    try {
        const result = await cloudinary.api.ping();
        console.log('Cloudinary connection test:', result);
    } catch (error) {
        console.error('Cloudinary connection failed:', error.message);
    }
};

testCloudinaryConnection();

// Configure Cloudinary Storage for Multer
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'user_avatars',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        transformation: [
            {
                width: 400,
                height: 400,
                crop: 'fill',
                quality: 'auto:good',
            }
        ],
        public_id: (req, file) => {
            const publicId = `avatar_${req.user._id}_${Date.now()}`;
            console.log('Generated public_id:', publicId);
            return publicId;
        },
    },
});

// File filter function with enhanced logging
const fileFilter = (req, file, cb) => {
    console.log('File filter check:', {
        fieldname: file.fieldname,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
    });

    // Check file type
    if (file.mimetype.startsWith('image/')) {
        console.log('File accepted');
        cb(null, true);
    } else {
        console.log('File rejected - not an image');
        cb(new Error('Only image files are allowed!'), false);
    }
};

// Create multer upload middleware with enhanced logging
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 1,
        fields: 1
    },
    fileFilter: fileFilter,
});

// Delete image from Cloudinary
const deleteFromCloudinary = async (publicId) => {
    try {
        if (publicId) {
            console.log('Deleting from Cloudinary:', publicId);
            const result = await cloudinary.uploader.destroy(publicId);
            console.log('Cloudinary delete result:', result);
            return result;
        }
    } catch (error) {
        console.error('Error deleting from Cloudinary:', error);
        throw error;
    }
};

// Enhanced middleware for single avatar upload with better error handling
const uploadAvatar = (req, res, next) => {
    console.log('Upload avatar middleware called');
    console.log('Request headers:', req.headers);
    console.log('User from req:', req.user ? { id: req.user._id } : 'No user found');

    const uploadSingle = upload.single('avatar');

    uploadSingle(req, res, (error) => {
        if (error) {
            console.error('Multer upload error:', error);
            return handleMulterError(error, req, res, next);
        }

        console.log('Multer upload successful');
        console.log('req.file before processing:', req.file);

        if (!req.file) {
            console.log('No file found in request');
            return res.status(400).json({
                success: false,
                message: 'No image file provided. Make sure to send the file with field name "avatar"'
            });
        }

        // Fix: Extract public_id from filename and use path as secure_url
        if (req.file.filename && req.file.path) {
            // The filename contains the full path including folder, extract just the public_id
            const publicId = req.file.filename;
            req.file.public_id = publicId;
            req.file.secure_url = req.file.path;

            console.log('Processed file info:', {
                public_id: req.file.public_id,
                secure_url: req.file.secure_url
            });
        } else {
            console.error('Missing expected file properties:', req.file);
            return res.status(500).json({
                success: false,
                message: 'File upload incomplete - missing file information'
            });
        }

        next();
    });
};

// Enhanced error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
    console.error('Handling multer error:', error);

    if (error instanceof multer.MulterError) {
        console.log('MulterError type:', error.code);

        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size too large. Maximum size is 5MB.'
            });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                message: 'Unexpected file field. Use "avatar" as the field name.'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files. Only one avatar image is allowed.'
            });
        }
    }

    if (error.message === 'Only image files are allowed!') {
        return res.status(400).json({
            success: false,
            message: 'Only image files (JPG, JPEG, PNG, GIF, WEBP) are allowed.'
        });
    }

    // Handle Cloudinary errors
    if (error.name === 'Error' && error.message.includes('cloudinary')) {
        return res.status(500).json({
            success: false,
            message: 'Image upload service error. Please try again.'
        });
    }

    console.error('Unhandled upload error:', error);
    return res.status(500).json({
        success: false,
        message: 'Upload error: ' + error.message
    });
};

module.exports = {
    uploadAvatar,
    handleMulterError,
    deleteFromCloudinary,
    cloudinary
};