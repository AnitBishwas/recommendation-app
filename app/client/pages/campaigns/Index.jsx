import { useEffect, useState } from "react";
import { navigate } from "raviger";

const CampaignIndex = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/apps/admin/campaign/list");
      const data = await res.json();
      if (data.ok) setCampaigns(data.campaigns);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <s-page heading="Campaigns">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/campaigns/create")}
      >
        Create campaign
      </s-button>

      {/* Error banner renders above the page body */}
      {!loading && error && (
        <s-banner
          slot="supplemental-start"
          tone="critical"
          heading="Failed to load campaigns"
        >
          <s-button slot="secondary-actions" onClick={fetchCampaigns}>
            Retry
          </s-button>
        </s-banner>
      )}

      {/* Loading */}
      {loading && (
        <s-box padding="1600">
          <s-stack direction="inline" justifyContent="center">
            <s-spinner size="large" accessibilityLabel="Loading campaigns" />
          </s-stack>
        </s-box>
      )}

      {/* Empty state */}
      {!loading && !error && campaigns.length === 0 && (
        <s-empty-state heading="No campaigns yet">
          <s-text slot="subheading">
            Create your first UTM-targeted product recommendation quiz.
          </s-text>
          <s-button
            slot="primary-action"
            variant="primary"
            onClick={() => navigate("/campaigns/create")}
          >
            Create campaign
          </s-button>
        </s-empty-state>
      )}

      {/* Campaign list */}
      {!loading && !error && campaigns.length > 0 && (
        <s-section padding="none">
          {/*
            paginate="" — stub; wire hasNextPage/hasPreviousPage and
            nextpage/previouspage events when backend adds page/limit support
          */}
          <s-table>
            {/* -- Filters: implement when backend supports query params -- */}
            <s-button-group slot="filters">
              <s-button disabled>Status</s-button>
              <s-button disabled>UTM Source</s-button>
              <s-button disabled>UTM Campaign</s-button>
            </s-button-group>

            <s-table-header-row>
              <s-table-header listSlot="primary">Name</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
              <s-table-header listSlot="labeled">UTM Campaign</s-table-header>
              <s-table-header listSlot="labeled">UTM Source</s-table-header>
              <s-table-header listSlot="labeled">Created</s-table-header>
            </s-table-header-row>

            <s-table-body>
              {campaigns.map((campaign) => (
                <s-table-row
                  key={campaign._id}
                  onClick={() => navigate(`/campaigns/${campaign._id}`)}
                >
                  <s-table-cell>
                    <s-text fontWeight="semibold">{campaign.name}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={campaign.is_active ? "success" : "neutral"}>
                      {campaign.is_active ? "Active" : "Inactive"}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{campaign.utm_campaign || "—"}</s-table-cell>
                  <s-table-cell>{campaign.utm_source || "—"}</s-table-cell>
                  <s-table-cell>
                    <s-text color="subdued">
                      {new Date(campaign.createdAt).toLocaleDateString()}
                    </s-text>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}
    </s-page>
  );
};

export default CampaignIndex;
