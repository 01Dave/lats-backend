import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import routes from "./routes";
import { errorHandlerMiddleware } from "./middleware/error-handler-middleware";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

  app.use("/api/v1", routes);

  app.use(errorHandlerMiddleware);

  return app;
}
