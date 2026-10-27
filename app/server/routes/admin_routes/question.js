import { Router } from "express";
import CampaignModel from "../../../utils/models/CampaignModel.js";
import QuestionModel from "../../../utils/models/QuestionModel.js";
import OptionModel from "../../../utils/models/OptionModel.js";
import ScoringRuleModel from "../../../utils/models/ScoringRuleModel.js";

const questionRoutes = Router();

// Returns the full nested questionnaire: questions → options → scoring rules
questionRoutes.get("/full/:campaignId", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const campaign = await CampaignModel.findOne({
      _id: req.params.campaignId,
      shop,
    });
    if (!campaign) return res.status(404).json({ ok: false });

    const questions = await QuestionModel.find({
      campaign_id: campaign._id,
    }).sort({ order: 1 });
    const questionIds = questions.map((q) => q._id);
    const options = await OptionModel.find({
      question_id: { $in: questionIds },
    }).sort({ order: 1 });
    const optionIds = options.map((o) => o._id);
    const rules = await ScoringRuleModel.find({
      option_id: { $in: optionIds },
    });

    const questionnaire = questions.map((q) => ({
      ...q.toObject(),
      options: options
        .filter((o) => o.question_id.toString() === q._id.toString())
        .map((o) => ({
          ...o.toObject(),
          scoring_rules: rules.filter(
            (r) => r.option_id.toString() === o._id.toString()
          ),
        })),
    }));

    return res
      .status(200)
      .json({ ok: true, campaign: campaign.toObject(), questionnaire });
  } catch (err) {
    console.error("Failed to load questionnaire -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

questionRoutes.put("/create", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const { campaign_id, text, type, is_required } = req.body;

    const campaign = await CampaignModel.findOne({ _id: campaign_id, shop });
    if (!campaign)
      return res
        .status(404)
        .json({ ok: false, message: "Campaign not found." });

    if (!text?.trim())
      return res.status(422).json({
        ok: false,
        field: "text",
        message: "Question text is required.",
      });
    if (!["single_select", "multi_select"].includes(type))
      return res
        .status(422)
        .json({ ok: false, field: "type", message: "Invalid question type." });

    const count = await QuestionModel.countDocuments({ campaign_id });
    const question = await QuestionModel.create({
      campaign_id,
      text: text.trim(),
      type,
      order: count + 1,
      is_required: Boolean(is_required),
    });

    return res
      .status(201)
      .json({ ok: true, question: { ...question.toObject(), options: [] } });
  } catch (err) {
    console.error("Failed to create question -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

// MUST be before POST /:id — otherwise Express treats "reorder" as an id
questionRoutes.post("/reorder", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const { campaign_id, order } = req.body;
    // order: [{id, order}]

    const campaign = await CampaignModel.findOne({ _id: campaign_id, shop });
    if (!campaign) return res.status(404).json({ ok: false });

    await Promise.all(
      order.map(({ id, order: o }) =>
        QuestionModel.findOneAndUpdate(
          { _id: id, campaign_id: campaign._id },
          { order: o }
        )
      )
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Failed to reorder questions -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

questionRoutes.get("/validate/:campaignId", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const campaign = await CampaignModel.findOne({
      _id: req.params.campaignId,
      shop,
    });
    if (!campaign) return res.status(404).json({ ok: false });

    const questions = await QuestionModel.find({
      campaign_id: campaign._id,
    }).sort({ order: 1 });
    const issues = [];

    if (questions.length === 0) {
      issues.push("No questions have been added to this campaign.");
      return res.status(200).json({ ok: true, valid: false, issues });
    }

    const questionIds = questions.map((q) => q._id);
    const options = await OptionModel.find({
      question_id: { $in: questionIds },
    });
    const optionIds = options.map((o) => o._id);
    const rules = await ScoringRuleModel.find({
      option_id: { $in: optionIds },
    });

    for (const q of questions) {
      const qOptions = options.filter(
        (o) => o.question_id.toString() === q._id.toString()
      );
      if (qOptions.length < 2) {
        issues.push(`Q${q.order} "${q.text}" has fewer than 2 options.`);
      }
      for (const o of qOptions) {
        const oRules = rules.filter(
          (r) => r.option_id.toString() === o._id.toString()
        );
        if (oRules.length === 0) {
          issues.push(
            `Option "${o.label}" in Q${q.order} has no scoring rules.`
          );
        }
      }
    }

    return res
      .status(200)
      .json({ ok: true, valid: issues.length === 0, issues });
  } catch (err) {
    console.error("Failed to validate questionnaire -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

questionRoutes.post("/:id", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const { text, type, is_required } = req.body;

    const question = await QuestionModel.findById(req.params.id);
    if (!question) return res.status(404).json({ ok: false });
    const campaign = await CampaignModel.findOne({
      _id: question.campaign_id,
      shop,
    });
    if (!campaign) return res.status(404).json({ ok: false });

    if (!text?.trim())
      return res.status(422).json({
        ok: false,
        field: "text",
        message: "Question text is required.",
      });
    if (!["single_select", "multi_select"].includes(type))
      return res
        .status(422)
        .json({ ok: false, field: "type", message: "Invalid question type." });

    const updated = await QuestionModel.findByIdAndUpdate(
      req.params.id,
      { text: text.trim(), type, is_required: Boolean(is_required) },
      { new: true }
    );

    return res.status(200).json({ ok: true, question: updated });
  } catch (err) {
    console.error("Failed to update question -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

// Cascade: deletes the question's options and their scoring rules
questionRoutes.delete("/:id", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const question = await QuestionModel.findById(req.params.id);
    if (!question) return res.status(404).json({ ok: false });
    const campaign = await CampaignModel.findOne({
      _id: question.campaign_id,
      shop,
    });
    if (!campaign) return res.status(404).json({ ok: false });

    const options = await OptionModel.find({ question_id: question._id });
    const optionIds = options.map((o) => o._id);
    await ScoringRuleModel.deleteMany({ option_id: { $in: optionIds } });
    await OptionModel.deleteMany({ question_id: question._id });
    await QuestionModel.findByIdAndDelete(req.params.id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Failed to delete question -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

export default questionRoutes;
