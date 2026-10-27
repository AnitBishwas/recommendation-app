import mongoose from "mongoose";

const answerSchema = new mongoose.Schema(
  {
    question_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    option_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: "Option" }],
  },
  { _id: false }
);

const quizSessionSchema = new mongoose.Schema(
  {
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
    },
    shop: { type: String, required: true },
    session_token: { type: String, required: true, unique: true },
    utm_source: { type: String, default: null },
    utm_medium: { type: String, default: null },
    utm_campaign: { type: String, default: null },
    answers: { type: [answerSchema], default: [] },
    result_product_ids: { type: [String], default: [] },
    completed: { type: Boolean, default: false },
    completed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

quizSessionSchema.index({ session_token: 1 });
quizSessionSchema.index({ shop: 1, campaign_id: 1 });

const QuizSessionModel = mongoose.model("QuizSession", quizSessionSchema);

export default QuizSessionModel;
