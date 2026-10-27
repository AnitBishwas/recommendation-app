import { Router } from "express";
import clientProvider from "../../../utils/clientProvider.js";
import CampaignModel from "../../../utils/models/CampaignModel.js";
import QuestionModel from "../../../utils/models/QuestionModel.js";
import OptionModel from "../../../utils/models/OptionModel.js";
import ScoringRuleModel from "../../../utils/models/ScoringRuleModel.js";

const proxyRouter = Router();

// GET /campaign
// Query params: utm_source, utm_medium, utm_campaign (all optional)
// Finds the most specific active campaign matching the visitor's UTM params,
// then returns the campaign + full question/option tree for the quiz.
proxyRouter.get("/campaign", async (req, res) => {
  try {
    const shop = res.locals.user_shop;
    const { utm_source, utm_medium, utm_campaign } = req.query;

    // For each UTM field: if the URL provides a value, match campaigns that either
    // have null (wildcard) or the exact same value. If the URL has no value for a
    // field, the campaign must also have null — otherwise this visitor doesn't satisfy
    // the campaign's targeting rule.
    const filter = {
      shop,
      is_active: true,
      utm_source: utm_source ? { $in: [null, utm_source] } : null,
      utm_medium: utm_medium ? { $in: [null, utm_medium] } : null,
      utm_campaign: utm_campaign ? { $in: [null, utm_campaign] } : null,
    };

    const campaigns = await CampaignModel.find(filter);
    if (!campaigns.length) {
      return res.status(200).json({ ok: true, campaign: null });
    }

    // Prefer the campaign with the most specific UTM targeting (most non-null fields)
    const campaign = campaigns.sort((a, b) => {
      const score = (c) =>
        [c.utm_source, c.utm_medium, c.utm_campaign].filter(Boolean).length;
      return score(b) - score(a);
    })[0];

    const questions = await QuestionModel.find({
      campaign_id: campaign._id,
    }).sort({ order: 1 });

    const questionIds = questions.map((q) => q._id);
    const options = await OptionModel.find({
      question_id: { $in: questionIds },
    }).sort({ order: 1 });

    const questionsWithOptions = questions.map((q) => ({
      _id: q._id,
      text: q.text,
      type: q.type,
      order: q.order,
      is_required: q.is_required,
      options: options
        .filter((o) => String(o.question_id) === String(q._id))
        .map((o) => ({
          _id: o._id,
          label: o.label,
          order: o.order,
          next_question_id: o.next_question_id ?? null,
        })),
    }));

    return res.status(200).json({
      ok: true,
      campaign: {
        _id: campaign._id,
        name: campaign.name,
        result_product_limit: campaign.result_product_limit,
      },
      questions: questionsWithOptions,
    });
  } catch (e) {
    console.error("Proxy /campaign error:", e);
    return res.status(400).json({ ok: false });
  }
});

// POST /recommend
// Body: { campaign_id, answers: [{ question_id, option_ids: [] }] }
// Runs the same scoring algorithm as the admin preview and returns ranked products.
proxyRouter.post("/recommend", async (req, res) => {
  try {
    const shop = res.locals.user_shop;
    const { campaign_id, answers } = req.body;

    if (!campaign_id || !Array.isArray(answers)) {
      return res.status(422).json({ ok: false, message: "Invalid request." });
    }

    const campaign = await CampaignModel.findOne({
      _id: campaign_id,
      shop,
      is_active: true,
    });
    if (!campaign) return res.status(404).json({ ok: false });

    const selectedOptionIds = answers.flatMap((a) => a.option_ids);
    if (!selectedOptionIds.length) {
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

    if (!Object.keys(scores).length) {
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
        query RecommendProducts($query: String!, $first: Int!) {
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
                variants(first: 1) {
                  edges {
                    node {
                      id
                      availableForSale
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { variables: { query: queryStr, first: 50 } }
    );

    const products = result.data.products.edges.map(({ node }) => {
      const variant = node.variants?.edges?.[0]?.node;
      return {
        id: node.id,
        title: node.title,
        handle: node.handle,
        image: node.featuredImage,
        tags: node.tags,
        price: node.priceRangeV2?.minVariantPrice,
        variantId: variant?.id?.split("/").pop() ?? null,
        availableForSale: variant?.availableForSale ?? true,
      };
    });

    const ranked = products
      .map((p) => ({
        ...p,
        score: p.tags.reduce((sum, tag) => sum + (scores[tag] || 0), 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, campaign.result_product_limit);

    return res.status(200).json({ ok: true, products: ranked });
  } catch (e) {
    console.error("Proxy /recommend error:", e);
    return res.status(400).json({ ok: false });
  }
});

export default proxyRouter;
