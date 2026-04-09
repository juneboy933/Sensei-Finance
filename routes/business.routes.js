import express from 'express';
import { transferFundController } from '../controllers/transferFunds.controller.js';
import { protectUser } from '../middlewares/auth.middleware.js';
import { depositFunds, withdrawFunds } from '../controllers/mpesa.controller.js';

const router = express.Router();

router.use(protectUser);

router.post('/transfer', transferFundController);
router.post('/deposit', depositFunds);
router.post('/withdraw', withdrawFunds);

export default router;