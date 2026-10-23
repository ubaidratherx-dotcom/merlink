import { Router } from "express";
import authRouter from "./auth.routes";
import usersRouter from "./users.routes";
import listingsRouter from "./listings.routes";
import buyRequestsRouter from "./buyRequests.routes";
import tradesRouter from "./trades.routes";
import chatRouter from "./chat.routes";
import reviewsRouter from "./reviews.routes";
import kycRouter from "./kyc.routes";
import emailRouter from "./email.routes";
import uploadRouter from "./upload.routes";
import walletRouter from "./wallet.routes";
import offersRouter from "./offers.routes";
import disputesRouter from "./disputes.routes";
import notificationsRouter from "./notifications.routes";
import btcRouter from "./btc.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/listings", listingsRouter);
apiRouter.use("/buy-requests", buyRequestsRouter);
apiRouter.use("/trades", tradesRouter);
apiRouter.use("/chat", chatRouter);
apiRouter.use("/reviews", reviewsRouter);
apiRouter.use("/kyc", kycRouter);
apiRouter.use("/email", emailRouter);
apiRouter.use("/upload", uploadRouter);
apiRouter.use("/wallet", walletRouter);
apiRouter.use("/offers", offersRouter);
apiRouter.use("/disputes", disputesRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/btc", btcRouter);

// Price feed
apiRouter.get("/prices", async (_req, res, next) => {
  try {
    const { priceService } = await import("../services/price.service");
    const prices = await priceService.getAllPrices();
    res.json({ success: true, data: prices });
  } catch (error) {
    next(error);
  }
});
