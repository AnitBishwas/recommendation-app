import React, { useEffect } from "react";
import { navigate } from "raviger";
import CampaignIndex from "./pages/campaigns/Index";
import CampaignCreate from "./pages/campaigns/Create";
import Campaign from "./pages/campaigns/Campaign";
import Questions from "./pages/campaigns/Questions";

const RedirectToCampaigns = () => {
  useEffect(() => {
    navigate("/campaigns", { replace: true });
  }, []);
  return null;
};

const routes = {
  "/": () => <RedirectToCampaigns />,
  "/campaigns": () => <CampaignIndex />,
  "/campaigns/create": () => <CampaignCreate />,
  "/campaigns/:id/questions": ({ id }) => <Questions id={id} />,
  "/campaigns/:id": ({ id }) => <Campaign id={id} />,
};

export default routes;
