import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import salesRouter from "./sales";
import adminSalesRouter from "./admin-sales";
import adminTeamRouter from "./admin-team";
import catalogRouter from "./catalog";
import storageRouter from "./storage";
import diningLocationsRouter from "./dining-locations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(salesRouter);
router.use(adminSalesRouter);
router.use(adminTeamRouter);
router.use(catalogRouter);
router.use(storageRouter);
router.use(diningLocationsRouter);

export default router;
