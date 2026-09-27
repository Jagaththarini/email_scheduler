import slackRoutes from "./routes/slack.routes.js";
import "dotenv/config";
import express from "express";
import cors from "cors";
import emailRoutes from "./routes/email.routes.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  })
);
app.use("/api/slack", slackRoutes);
app.use(express.json());

app.use("/api/emails", emailRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = Number(process.env.PORT || 4000);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});