const express = require('express');
const router = express.Router();
const ownerController = require('../controllers/ownerController');
const { requireOwner } = require('../middleware/ownerAuth');

// Mounted at /api/owner in server.js.

// Public / bootstrap. /setup only succeeds while ZERO owner accounts exist
// (i.e. the very first time the Owner Portal is opened).
router.get('/status', ownerController.getStatus);
router.post('/setup', ownerController.setup);
router.post('/login', ownerController.login);

// Session-protected. Everything below needs an Owner login token.
router.post('/logout', requireOwner, ownerController.logout);
router.get('/me', requireOwner, ownerController.me);
router.get('/cafes', requireOwner, ownerController.listCafes);
router.post('/cafes', requireOwner, ownerController.createCafe);
router.post('/cafes/:cafeId/staff', requireOwner, ownerController.createStaff);
router.put('/cafes/:cafeId/staff/:username', requireOwner, ownerController.updateStaff);
router.delete('/cafes/:cafeId/staff/:username', requireOwner, ownerController.deleteStaff);
router.delete('/cafes/:cafeId', requireOwner, ownerController.deleteCafe);
router.post('/cafes/:cafeId/rotate-key', requireOwner, ownerController.rotateKey);

module.exports = router;