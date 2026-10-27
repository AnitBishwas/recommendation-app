import { Router } from "express";
import CampaignModel from "../../../utils/models/CampaignModel.js";
import QuestionModel from "../../../utils/models/QuestionModel.js";
import OptionModel from "../../../utils/models/OptionModel.js";
import ScoringRuleModel from "../../../utils/models/ScoringRuleModel.js";

const scoringRuleRoutes = Router();

const verifyOwnership = async (optionId, shop) => {
  const option = await OptionModel.findById(optionId);
  if (!option) return null;
  const question = await QuestionModel.findById(option.question_id);
  if (!question) return null;
  const campaign = await CampaignModel.findOne({
    _id: question.campaign_id,
    shop,
  });
  if (!campaign) return null;
  return option;
};

scoringRuleRoutes.put("/create", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const { option_id, target_type, target_value, weight } = req.body;

    const option = await verifyOwnership(option_id, shop);
    if (!option)
      return res.status(404).json({ ok: false, message: "Option not found." });

    if (!["product_tag", "collection_id", "product_id"].includes(target_type)) {
      return res.status(422).json({
        ok: false,
        field: "target_type",
        message: "Invalid target type.",
      });
    }
    if (!target_value?.trim())
      return res.status(422).json({
        ok: false,
        field: "target_value",
        message: "Target value is required.",
      });

    const rule = await ScoringRuleModel.create({
      option_id,
      target_type,
      target_value: target_value.trim(),
      weight: Math.min(10, Math.max(1, Number(weight) || 1)),
    });

    return res.status(201).json({ ok: true, rule });
  } catch (err) {
    console.error("Failed to create scoring rule -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

scoringRuleRoutes.delete("/:id", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const rule = await ScoringRuleModel.findById(req.params.id);
    if (!rule) return res.status(404).json({ ok: false });
    const option = await verifyOwnership(rule.option_id, shop);
    if (!option) return res.status(404).json({ ok: false });

    await ScoringRuleModel.findByIdAndDelete(req.params.id);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Failed to delete scoring rule -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

export default scoringRuleRoutes;
