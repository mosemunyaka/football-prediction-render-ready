import { Router, type IRouter } from "express";
import healthRouter from "./health";
import matchesRouter from "./matches";
import predictionsRouter from "./predictions";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/matches", matchesRouter);
router.use("/predictions", predictionsRouter);

export default router;
