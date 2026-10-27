import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
    },
    text: { type: String, required: true },
    type: {
      type: String,
      enum: ["single_select", "multi_select"],
      required: true,
    },
    order: { type: Number, required: true },
    is_required: { type: Boolean, default: true },
  },
  { timestamps: true }
);

questionSchema.index({ campaign_id: 1, order: 1 });

const QuestionModel = mongoose.model("Question", questionSchema);

export default QuestionModel;
