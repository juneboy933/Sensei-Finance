import { verifyAccountOwnership } from "../services/auth/verifyOwnership.service.js";
import { transferFunds } from "../services/business/transferFunds.service.js";

export const transferFundController = async (req, res) => {
    const {senderAccountId, receiverAccountId, amount, description} = req.body;
    const authenticatedUser = req.user.userId;

    try {
      await verifyAccountOwnership(authenticatedUser, senderAccountId);
      const result = await transferFunds(senderAccountId, receiverAccountId, amount, description);
      
      return res.status(200).json({ message: 'Transfer successful', data: result});
    } catch (error) {
        const statusCode = error.message.includes('Unauthorized') ? 409 : 400;
        return res.status(statusCode).json({ error: error.message});
    }
};