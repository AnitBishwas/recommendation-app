import { useRef, useEffect, useState } from "react";
import { navigate } from "raviger";
import QuestionnaireBuilder from "../../components/QuestionnaireBuilder";

const DEFAULTS = {
  name: "",
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
  match_mode: "all",
  is_active: false,
  result_tag_limit: 3,
  result_product_limit: 4,
};

// ─── Step 1: Campaign details form ────────────────────────────────────────────

const CampaignForm = ({ onCreated }) => {
  const [form, setForm] = useState(DEFAULTS);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const switchRef = useRef(null);

  useEffect(() => {
    if (switchRef.current) {
      switchRef.current.checked = form.is_active;
    }
  }, [form.is_active]);

  const setField = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Campaign name is required.";
    if (
      !form.utm_source.trim() &&
      !form.utm_medium.trim() &&
      !form.utm_campaign.trim()
    ) {
      errs.utm = "At least one UTM field is required.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/apps/admin/campaign/create", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          result_tag_limit: Number(form.result_tag_limit),
          result_product_limit: Number(form.result_product_limit),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        onCreated(data.campaign);
      } else if (data.field) {
        setErrors({ [data.field]: data.message });
      } else {
        setErrors({ submit: "Something went wrong. Please try again." });
      }
    } catch {
      setErrors({ submit: "Something went wrong. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <s-button slot="secondary-actions" onClick={() => navigate("/campaigns")}>
        Discard
      </s-button>
      <s-button
        slot="primary-action"
        variant="primary"
        loading={saving}
        onClick={handleSubmit}
      >
        Create campaign
      </s-button>

      {errors.submit && (
        <s-banner
          slot="supplemental-start"
          tone="critical"
          heading={errors.submit}
        />
      )}

      <s-stack direction="block" gap="400">
        <s-section heading="Campaign details">
          <s-stack direction="block" gap="300">
            <s-text-field
              label="Campaign name"
              value={form.name}
              placeholder="e.g. Bold lip lovers"
              required=""
              error={errors.name}
              onInput={setField("name")}
            />
            <s-select
              label="UTM match mode"
              value={form.match_mode}
              onChange={setField("match_mode")}
            >
              <s-option value="all">All conditions must match (AND)</s-option>
              <s-option value="any">Any condition can match (OR)</s-option>
            </s-select>
            <s-switch
              ref={switchRef}
              label="Active"
              details="Inactive campaigns won't be shown to customers."
              onChange={() =>
                setForm((prev) => ({ ...prev, is_active: !prev.is_active }))
              }
            />
          </s-stack>
        </s-section>

        <s-section
          heading="UTM targeting"
          subheading="At least one field is required. Leave unused fields blank."
        >
          <s-stack direction="block" gap="300">
            {errors.utm && <s-banner tone="critical" heading={errors.utm} />}
            <s-grid gridTemplateColumns="1fr 1fr 1fr">
              <s-text-field
                label="UTM Source"
                value={form.utm_source}
                placeholder="instagram"
                onInput={setField("utm_source")}
              />
              <s-text-field
                label="UTM Medium"
                value={form.utm_medium}
                placeholder="paid_social"
                onInput={setField("utm_medium")}
              />
              <s-text-field
                label="UTM Campaign"
                value={form.utm_campaign}
                placeholder="bold-lip"
                onInput={setField("utm_campaign")}
              />
            </s-grid>
          </s-stack>
        </s-section>

        <s-section
          heading="Result settings"
          subheading="Controls how many top-scoring tags are queried and how many products are returned."
        >
          <s-grid gridTemplateColumns="1fr 1fr">
            <s-text-field
              label="Max tags for product query"
              value={String(form.result_tag_limit)}
              placeholder="3"
              onInput={(e) =>
                setForm((prev) => ({
                  ...prev,
                  result_tag_limit: e.target.value,
                }))
              }
            />
            <s-text-field
              label="Products to return"
              value={String(form.result_product_limit)}
              placeholder="4"
              onInput={(e) =>
                setForm((prev) => ({
                  ...prev,
                  result_product_limit: e.target.value,
                }))
              }
            />
          </s-grid>
        </s-section>
      </s-stack>
    </>
  );
};

// ─── Step 2: Questionnaire setup ──────────────────────────────────────────────

const QuestionnaireStep = ({ campaign }) => (
  <>
    <s-button
      slot="primary-action"
      variant="primary"
      onClick={() => navigate(`/campaigns/${campaign._id}`)}
    >
      Done
    </s-button>

    <s-stack direction="block" gap="400">
      <s-banner tone="success" heading={`"${campaign.name}" was created.`}>
        <s-text slot="subheading">
          Add questions below, or click Done to finish the questionnaire later.
        </s-text>
      </s-banner>

      {/* Builder renders its own s-section elements — no outer section wrapper */}
      <QuestionnaireBuilder campaignId={campaign._id} />
    </s-stack>
  </>
);

// ─── CampaignCreate ───────────────────────────────────────────────────────────

const CampaignCreate = () => {
  const [createdCampaign, setCreatedCampaign] = useState(null);

  return (
    <s-page
      heading={createdCampaign ? "Set up questionnaire" : "Create campaign"}
    >
      <s-button
        slot="breadcrumb-actions"
        onClick={() => navigate("/campaigns")}
      >
        Campaigns
      </s-button>

      {createdCampaign ? (
        <QuestionnaireStep campaign={createdCampaign} />
      ) : (
        <CampaignForm onCreated={setCreatedCampaign} />
      )}
    </s-page>
  );
};

export default CampaignCreate;
