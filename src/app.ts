import express, { Express } from "express";
import cors, { CorsOptions } from "cors";
import helmet from "helmet";
import routes from "./routes";
import { errorHandlerMiddleware } from "./middleware/error-handler-middleware";
import { env } from "./config/env";
import { isOriginAllowed } from "./config/cors";
import { ForbiddenError } from "./utils/errors";

function buildCorsOptions(): CorsOptions {
  return {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin, env.corsAllowedOrigins)) {
        callback(null, true);
        return;
      }
      // A typed error here (rather than a bare Error) so this reaches
      // error-handler-middleware.ts and comes back as the project's
      // standard { code, message } shape with a 403, not an opaque
      // Express default error page.
      callback(new ForbiddenError(`Origin '${origin}' is not allowed`));
    },
  };
}

export function createApp(): Express {
  const app = express();

  // Only trust X-Forwarded-For when told how many proxies are in front of
  // this server — trusting it blindly would let any client spoof its IP
  // and sidestep the login throttle. See TRUST_PROXY_HOPS in env.ts.
  if (env.trustProxyHops > 0) {
    app.set("trust proxy", env.trustProxyHops);
  }

  app.use(helmet());
  app.use(cors(buildCorsOptions()));
  app.use(express.json());

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

  app.use("/api/v1", routes);

  app.use(errorHandlerMiddleware);

  return app;
}
