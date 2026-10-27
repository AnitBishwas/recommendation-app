import { useState } from "react";
import { navigate } from "raviger";
import QuestionnaireBuilder from "../../components/QuestionnaireBuilder";

const Questions = ({ id }) => {
  const [campaign, setCampaign] = useState(null);

  return (
    <s-page
      heading={campaign ? `${campaign.name} — Questionnaire` : "Questionnaire"}
    >
      <s-button
        slot="breadcrumb-actions"
        onClick={() => navigate(`/campaigns/${id}`)}
      >
        {campaign?.name ?? "Campaign"}
      </s-button>
      <s-stack direction="block" gap="400">
        <QuestionnaireBuilder campaignId={id} onLoad={setCampaign} />
      </s-stack>
    </s-page>
  );
};

export default Questions;
