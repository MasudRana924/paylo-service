const formidable = require('formidable');
const fs = require('fs');
const path = require('path');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

const handleFileUpload = (req, res, next) => {
  const form = new formidable.IncomingForm({
    maxFileSize: MAX_FILE_SIZE,
    keepExtensions: true,
    multiples: false,
  });

  form.parse(req, (err, fields, files) => {
    if (err) {
      console.error('Form parse error:', err);
      if (err.code === 'maxFileSize') {
        res.end(JSON.stringify({ errorMessage: 'Image size exceeds 5MB limit' }));
        return;
      }
      res.end(JSON.stringify({ errorMessage: 'Error parsing file' }));
      return;
    }

    console.log('Files received:', files);
    console.log('Fields received:', fields);

    req.files = files;
    req.fields = fields;
    next();
  });
};

const cleanupFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error cleaning up file:', error);
  }
};

module.exports = {
  handleFileUpload,
  cleanupFile,
  MAX_FILE_SIZE
};
