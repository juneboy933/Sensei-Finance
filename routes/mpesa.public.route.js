import express from 'express';
import { mpesaCallback } from '../controllers/mpesa.controller.js';

const router = express.Router();

router.post('/callback', mpesaCallback);

export default router;