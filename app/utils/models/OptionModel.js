import mongoose from "mongoose";

const optionSchema = new mongoose.Schema(
  {
    question_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    label: { type: String, required: true },
    order: { type: Number, required: true },
    // null = advance to next question in order; set to jump to a specific question
    next_question_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      default: null,
    },
  },
  { timestamps: true }
);

optionSchema.index({ question_id: 1, order: 1 });

const OptionModel = mongoose.model("Option", optionSchema);

export default OptionModel;
