const cloudinary = require('../config/cloudinary');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

const uploadImageToCloudinary = async (filePath) => {
  try {
    // Check if file path is provided
    if (!filePath) {
      throw new Error('No file provided');
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'profile_images',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      max_file_size: MAX_FILE_SIZE,
      transformation: [
        { width: 500, height: 500, crop: 'limit', quality: 'auto' }
      ]
    });

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    if (error.message && error.message.includes('File size')) {
      throw new Error('Image size exceeds 5MB limit');
    }
    throw new Error('Failed to upload image');
  }
};

const deleteImageFromCloudinary = async (publicId) => {
  try {
    if (!publicId) return;
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
  }
};

module.exports = {
  uploadImageToCloudinary,
  deleteImageFromCloudinary,
  MAX_FILE_SIZE
};
