import { Router } from "express";
import CampaignModel from "../../../utils/models/CampaignModel.js";
import QuestionModel from "../../../utils/models/QuestionModel.js";
import OptionModel from "../../../utils/models/OptionModel.js";
import ScoringRuleModel from "../../../utils/models/ScoringRuleModel.js";
import clientProvider from "../../../utils/clientProvider.js";
const campaignRoutes = Router();

campaignRoutes.get("/list", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;

    const filter = { shop };

    // -- Filtering (implement later) --
    // if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === "true";
    // if (req.query.utm_source) filter.utm_source = req.query.utm_source;
    // if (req.query.utm_campaign) filter.utm_campaign = req.query.utm_campaign;

    // -- Pagination (implement later) --
    // const page = Math.max(1, parseInt(req.query.page) || 1);
    // const limit = Math.min(50, parseInt(req.query.limit) || 20);
    // const skip = (page - 1) * limit;

    const campaigns = await CampaignModel.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({ ok: true, campaigns });
  } catch (err) {
    console.error("Failed to retrieve campaigns list reason -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});
campaignRoutes.put("/create", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const {
      name,
      utm_source,
      utm_medium,
      utm_campaign,
      match_mode,
      is_active,
      result_tag_limit,
      result_product_limit,
    } = req.body;

    if (!name?.trim()) {
      return res.status(422).json({
        ok: false,
        field: "name",
        message: "Campaign name is required.",
      });
    }

    if (!utm_source?.trim() && !utm_medium?.trim() && !utm_campaign?.trim()) {
      return res.status(422).json({
        ok: false,
        field: "utm",
        message: "At least one UTM field is required.",
      });
    }

    const campaign = await CampaignModel.create({
      shop,
      name: name.trim(),
      utm_source: utm_source?.trim() || null,
      utm_medium: utm_medium?.trim() || null,
      utm_campaign: utm_campaign?.trim() || null,
      match_mode: match_mode || "all",
      is_active: Boolean(is_active),
      result_tag_limit: Number(result_tag_limit) || 3,
      result_product_limit: Number(result_product_limit) || 4,
    });

    return res.status(201).json({ ok: true, campaign });
  } catch (err) {
    console.error("Failed to create campaign reason -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

campaignRoutes.get("/:id", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const campaign = await CampaignModel.findOne({ _id: req.params.id, shop });

    if (!campaign) {
      return res
        .status(404)
        .json({ ok: false, message: "Campaign not found." });
    }

    return res.status(200).json({ ok: true, campaign });
  } catch (err) {
    console.error("Failed to retrieve campaign reason -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

// MUST be before POST /:id so "preview" isn't treated as a campaign id
campaignRoutes.post("/:id/preview", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const { answers } = req.body; // [{question_id, option_ids: []}]

    const campaign = await CampaignModel.findOne({ _id: req.params.id, shop });
    if (!campaign) return res.status(404).json({ ok: false });

    const selectedOptionIds = answers.flatMap((a) => a.option_ids);
    if (selectedOptionIds.length === 0) {
      return res.status(200).json({ ok: true, products: [] });
    }

    const rules = await ScoringRuleModel.find({
      option_id: { $in: selectedOptionIds },
    });

    const scores = {};
    for (const rule of rules) {
      scores[rule.target_value] =
        (scores[rule.target_value] || 0) + rule.weight;
    }

    if (Object.keys(scores).length === 0) {
      return res.status(200).json({ ok: true, products: [] });
    }

    const topTags = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, campaign.result_tag_limit)
      .map(([tag]) => tag);

    const { client } = await clientProvider.offline.graphqlClient({ shop });
    const queryStr = topTags.map((t) => `tag:${t}`).join(" OR ");

    const result = await client.request(
      /* GraphQL */ `
        query PreviewProducts($query: String!, $first: Int!) {
          products(first: $first, query: $query) {
            edges {
              node {
                id
                title
                handle
                featuredImage {
                  url
                  altText
                }
                tags
                priceRangeV2 {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      `,
      { variables: { query: queryStr, first: 50 } }
    );

    const products = result.data.products.edges.map(({ node }) => ({
      id: node.id,
      title: node.title,
      handle: node.handle,
      image: node.featuredImage,
      tags: node.tags,
      price: node.priceRangeV2?.minVariantPrice,
    }));

    const ranked = products
      .map((p) => ({
        ...p,
        score: p.tags.reduce((sum, tag) => sum + (scores[tag] || 0), 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, campaign.result_product_limit);

    return res.status(200).json({ ok: true, products: ranked });
  } catch (err) {
    console.error("Failed to preview campaign -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

campaignRoutes.post("/:id", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const {
      name,
      utm_source,
      utm_medium,
      utm_campaign,
      match_mode,
      is_active,
      result_tag_limit,
      result_product_limit,
    } = req.body;

    if (!name?.trim()) {
      return res.status(422).json({
        ok: false,
        field: "name",
        message: "Campaign name is required.",
      });
    }

    if (!utm_source?.trim() && !utm_medium?.trim() && !utm_campaign?.trim()) {
      return res.status(422).json({
        ok: false,
        field: "utm",
        message: "At least one UTM field is required.",
      });
    }

    const campaign = await CampaignModel.findOneAndUpdate(
      { _id: req.params.id, shop },
      {
        name: name.trim(),
        utm_source: utm_source?.trim() || null,
        utm_medium: utm_medium?.trim() || null,
        utm_campaign: utm_campaign?.trim() || null,
        match_mode: match_mode || "all",
        is_active: Boolean(is_active),
        result_tag_limit: Number(result_tag_limit) || 3,
        result_product_limit: Number(result_product_limit) || 4,
      },
      { new: true }
    );

    if (!campaign) {
      return res
        .status(404)
        .json({ ok: false, message: "Campaign not found." });
    }

    return res.status(200).json({ ok: true, campaign });
  } catch (err) {
    console.error("Failed to update campaign reason -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

// Cascade: deletes all questions, options, and scoring rules for the campaign
campaignRoutes.delete("/:id", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const campaign = await CampaignModel.findOne({ _id: req.params.id, shop });
    if (!campaign) return res.status(404).json({ ok: false });

    const questions = await QuestionModel.find({ campaign_id: campaign._id });
    const questionIds = questions.map((q) => q._id);
    const options = await OptionModel.find({
      question_id: { $in: questionIds },
    });
    const optionIds = options.map((o) => o._id);

    await ScoringRuleModel.deleteMany({ option_id: { $in: optionIds } });
    await OptionModel.deleteMany({ question_id: { $in: questionIds } });
    await QuestionModel.deleteMany({ campaign_id: campaign._id });
    await CampaignModel.findByIdAndDelete(campaign._id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Failed to delete campaign -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

export default campaignRoutes;
