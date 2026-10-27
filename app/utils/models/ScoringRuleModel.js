import mongoose from "mongoose";

const scoringRuleSchema = new mongoose.Schema(
  {
    option_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Option",
      required: true,
    },
    target_type: {
      type: String,
      enum: ["product_tag", "collection_id", "product_id"],
      required: true,
    },
    target_value: { type: String, required: true },
    weight: { type: Number, default: 1, min: 1, max: 10 },
  },
  { timestamps: true }
);

scoringRuleSchema.index({ option_id: 1 });

const ScoringRuleModel = mongoose.model("ScoringRule", scoringRuleSchema);

export default ScoringRuleModel;
