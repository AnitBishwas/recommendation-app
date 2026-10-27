import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    shop: { type: String, required: true },
    name: { type: String, required: true },
    utm_source: { type: String, default: null },
    utm_medium: { type: String, default: null },
    utm_campaign: { type: String, default: null },
    match_mode: { type: String, enum: ["all", "any"], default: "all" },
    is_active: { type: Boolean, default: false },
    result_tag_limit: { type: Number, default: 3, min: 1, max: 10 },
    result_product_limit: { type: Number, default: 4, min: 1, max: 20 },
  },
  { timestamps: true }
);

campaignSchema.index({ shop: 1, is_active: 1 });

const CampaignModel = mongoose.model("Campaign", campaignSchema);

export default CampaignModel;
