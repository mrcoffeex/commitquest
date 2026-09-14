import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./env.js";
import { router } from "./routes.js";

const app = express();

app.use(
  cors({
    origin: env.webOrigin,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as typeof req & { rawBody: string }).rawBody = buf.toString("utf8");
    },
  }),
);
app.use("/api", router);

app.listen(env.port, () => {
  console.log(`CommitQuest API on http://localhost:${env.port} (AUTH_MOCK=${env.authMock})`);
});
