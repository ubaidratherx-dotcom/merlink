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
