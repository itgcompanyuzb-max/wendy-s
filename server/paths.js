// Where the database and uploaded files live. On a host with a persistent disk set STORAGE_DIR to its mount path.
const path = require('path');
const base = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(__dirname, '..');
module.exports = {
  dataDir: path.join(base, 'data'),
  uploadsDir: path.join(base, 'uploads'),
  repoUploads: path.join(__dirname, '..', 'uploads'), // menu photos shipped with the code
};
