import { useEffect, useRef, useState } from "react";
import { navigate } from "raviger";
import QuestionnaireBuilder from "../../components/QuestionnaireBuilder";

const toFormState = (campaign) => ({
  name: campaign.name,
  utm_source: campaign.utm_source || "",
  utm_medium: campaign.utm_medium || "",
  utm_campaign: campaign.utm_campaign || "",
  match_mode: campaign.match_mode,
  is_active: campaign.is_active,
  result_tag_limit: campaign.result_tag_limit,
  result_product_limit: campaign.result_product_limit,
});

const Campaign = ({ id }) => {
  const [campaign, setCampaign] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const switchRef = useRef(null);

  useEffect(() => {
    fetchCampaign();
  }, [id]);

  // React 18 uses setAttribute for custom elements, not property assignment.
  // s-switch reads the checked property internally, so we must set it via ref.
  useEffect(() => {
    if (switchRef.current && form !== null) {
      switchRef.current.checked = form.is_active;
    }
  }, [form?.is_active]);

  const fetchCampaign = async () => {
    setLoading(true);
    setNotFound(false);
    setErrors({});
    try {
      const res = await fetch(`/api/apps/admin/campaign/${id}`);
      const data = await res.json();
      if (data.ok) {
        setCampaign(data.campaign);
        setForm(toFormState(data.campaign));
      } else if (res.status === 404) {
        setNotFound(true);
      } else {
        setErrors({ fetch: "Failed to load campaign." });
      }
    } catch {
      setErrors({ fetch: "Failed to load campaign." });
    } finally {
      setLoading(false);
    }
  };

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

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/apps/admin/campaign/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          result_tag_limit: Number(form.result_tag_limit),
          result_product_limit: Number(form.result_product_limit),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setCampaign(data.campaign);
        setForm(toFormState(data.campaign));
        shopify.toast.show("Campaign saved");
      } else if (data.field) {
        setErrors({ [data.field]: data.message });
        shopify.toast.show("Failed to save campaign", { isError: true });
      } else {
        shopify.toast.show("Failed to save campaign", { isError: true });
      }
    } catch {
      shopify.toast.show("Failed to save campaign", { isError: true });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/apps/admin/campaign/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        shopify.toast.show("Campaign deleted");
        navigate("/campaigns");
      } else {
        shopify.toast.show("Failed to delete campaign", { isError: true });
        setConfirmDelete(false);
      }
    } catch {
      shopify.toast.show("Failed to delete campaign", { isError: true });
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <s-page heading="Campaign">
        <s-box padding="1600">
          <s-stack direction="inline" justifyContent="center">
            <s-spinner size="large" accessibilityLabel="Loading campaign" />
          </s-stack>
        </s-box>
      </s-page>
    );
  }

  if (notFound) {
    return (
      <s-page heading="Campaign not found">
        <s-button
          slot="breadcrumb-actions"
          onClick={() => navigate("/campaigns")}
        >
          Campaigns
        </s-button>
        <s-empty-state heading="This campaign doesn't exist">
          <s-text slot="subheading">
            It may have been deleted or the link is incorrect.
          </s-text>
          <s-button
            slot="primary-action"
            variant="primary"
            onClick={() => navigate("/campaigns")}
          >
            Back to campaigns
          </s-button>
        </s-empty-state>
      </s-page>
    );
  }

  if (errors.fetch) {
    return (
      <s-page heading="Campaign">
        <s-button
          slot="breadcrumb-actions"
          onClick={() => navigate("/campaigns")}
        >
          Campaigns
        </s-button>
        <s-banner tone="critical" heading={errors.fetch}>
          <s-button slot="secondary-actions" onClick={fetchCampaign}>
            Retry
          </s-button>
        </s-banner>
      </s-page>
    );
  }

  return (
    <s-page heading={campaign.name}>
      <s-button
        slot="breadcrumb-actions"
        onClick={() => navigate("/campaigns")}
      >
        Campaigns
      </s-button>

      <s-button
        slot="secondary-actions"
        tone="critical"
        onClick={() => setConfirmDelete(true)}
      >
        Delete campaign
      </s-button>

      <s-button slot="secondary-actions" onClick={() => navigate("/campaigns")}>
        Discard
      </s-button>

      <s-button
        slot="primary-action"
        variant="primary"
        loading={saving}
        onClick={handleSave}
      >
        Save
      </s-button>

      <s-stack direction="block" gap="400">
        {confirmDelete && (
          <s-banner tone="critical" heading="Delete this campaign?">
            <s-text slot="subheading">
              This will permanently delete the campaign and all its questions,
              options, and scoring rules. This cannot be undone.
            </s-text>
            <s-button
              slot="secondary-actions"
              tone="critical"
              loading={deleting}
              onClick={handleDelete}
            >
              Delete
            </s-button>
            <s-button
              slot="secondary-actions"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </s-button>
          </s-banner>
        )}

        {/* Campaign details */}
        <s-section heading="Campaign details">
          <s-stack direction="block" gap="300">
            <s-text-field
              label="Campaign name"
              value={form.name}
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

        {/* UTM targeting */}
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

        {/* Result settings */}
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

        {/* Questionnaire — builder renders its own s-section elements */}
        <QuestionnaireBuilder campaignId={id} />
      </s-stack>
    </s-page>
  );
};

export default Campaign;
