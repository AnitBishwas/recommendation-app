import { Router } from "express";
import campaignRoutes from "./campaign.js";
import questionRoutes from "./question.js";
import optionRoutes from "./option.js";
import scoringRuleRoutes from "./scoringRule.js";
import shopRoutes from "./shop.js";

const adminRoutes = Router();

adminRoutes.use("/campaign", campaignRoutes);
adminRoutes.use("/question", questionRoutes);
adminRoutes.use("/option", optionRoutes);
adminRoutes.use("/scoring-rule", scoringRuleRoutes);
adminRoutes.use("/shop", shopRoutes);

export default adminRoutes;
