import { Router } from "express";
import CampaignModel from "../../../utils/models/CampaignModel.js";
import QuestionModel from "../../../utils/models/QuestionModel.js";
import OptionModel from "../../../utils/models/OptionModel.js";
import ScoringRuleModel from "../../../utils/models/ScoringRuleModel.js";

const optionRoutes = Router();

const verifyOwnership = async (questionId, shop) => {
  const question = await QuestionModel.findById(questionId);
  if (!question) return null;
  const campaign = await CampaignModel.findOne({
    _id: question.campaign_id,
    shop,
  });
  if (!campaign) return null;
  return question;
};

optionRoutes.put("/create", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const { question_id, label, next_question_id } = req.body;

    const question = await verifyOwnership(question_id, shop);
    if (!question)
      return res
        .status(404)
        .json({ ok: false, message: "Question not found." });

    if (!label?.trim())
      return res.status(422).json({
        ok: false,
        field: "label",
        message: "Option label is required.",
      });

    const count = await OptionModel.countDocuments({ question_id });
    const option = await OptionModel.create({
      question_id,
      label: label.trim(),
      order: count + 1,
      next_question_id: next_question_id || null,
    });

    return res
      .status(201)
      .json({ ok: true, option: { ...option.toObject(), scoring_rules: [] } });
  } catch (err) {
    console.error("Failed to create option -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

optionRoutes.post("/:id", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const { label, next_question_id } = req.body;

    const option = await OptionModel.findById(req.params.id);
    if (!option) return res.status(404).json({ ok: false });
    const question = await verifyOwnership(option.question_id, shop);
    if (!question) return res.status(404).json({ ok: false });

    if (!label?.trim())
      return res.status(422).json({
        ok: false,
        field: "label",
        message: "Option label is required.",
      });

    const updated = await OptionModel.findByIdAndUpdate(
      req.params.id,
      { label: label.trim(), next_question_id: next_question_id || null },
      { new: true }
    );

    return res.status(200).json({ ok: true, option: updated });
  } catch (err) {
    console.error("Failed to update option -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

// Cascade: deletes the option's scoring rules
optionRoutes.delete("/:id", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const option = await OptionModel.findById(req.params.id);
    if (!option) return res.status(404).json({ ok: false });
    const question = await verifyOwnership(option.question_id, shop);
    if (!question) return res.status(404).json({ ok: false });

    await ScoringRuleModel.deleteMany({ option_id: option._id });
    await OptionModel.findByIdAndDelete(req.params.id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Failed to delete option -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

export default optionRoutes;
