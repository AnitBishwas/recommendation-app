import { useEffect, useState } from "react";

// ─── API helpers ─────────────────────────────────────────────────────────────

const json = (url, method = "GET", body) =>
  fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

const api = {
  load: (cid) => json(`/api/apps/admin/question/full/${cid}`),
  createQuestion: (body) =>
    json("/api/apps/admin/question/create", "PUT", body),
  updateQuestion: (id, body) =>
    json(`/api/apps/admin/question/${id}`, "POST", body),
  deleteQuestion: (id) => json(`/api/apps/admin/question/${id}`, "DELETE"),
  reorderQuestions: (campaign_id, order) =>
    json("/api/apps/admin/question/reorder", "POST", { campaign_id, order }),
  createOption: (body) => json("/api/apps/admin/option/create", "PUT", body),
  updateOption: (id, body) =>
    json(`/api/apps/admin/option/${id}`, "POST", body),
  deleteOption: (id) => json(`/api/apps/admin/option/${id}`, "DELETE"),
  createRule: (body) =>
    json("/api/apps/admin/scoring-rule/create", "PUT", body),
  deleteRule: (id) => json(`/api/apps/admin/scoring-rule/${id}`, "DELETE"),
  previewCampaign: (id, answers) =>
    json(`/api/apps/admin/campaign/${id}/preview`, "POST", { answers }),
  productTags: () => json("/api/apps/admin/shop/product-tags"),
};

// ─── Immutable state helpers ──────────────────────────────────────────────────

const updateQ = (qs, id, patch) =>
  qs.map((q) => (q._id === id ? { ...q, ...patch } : q));

const updateO = (qs, qId, oId, patch) =>
  updateQ(qs, qId, {
    options: qs
      .find((q) => q._id === qId)
      ?.options.map((o) => (o._id === oId ? { ...o, ...patch } : o)),
  });

// ─── Blank form states ────────────────────────────────────────────────────────

const blankQuestion = () => ({
  text: "",
  type: "single_select",
  is_required: true,
});
const blankOption = () => ({ label: "", next_question_id: "" });
const blankRule = () => ({
  target_type: "product_tag",
  target_value: "",
  weight: "1",
});

// ─── AddRuleForm ─────────────────────────────────────────────────────────────

const AddRuleForm = ({
  questionId,
  optionId,
  shopTags,
  onLoadTags,
  onAdd,
  onCancel,
}) => {
  const [form, setForm] = useState(blankRule());
  const [saving, setSaving] = useState(false);
  const [tagFilter, setTagFilter] = useState("");

  useEffect(() => {
    if (form.target_type === "product_tag" && shopTags === null) {
      onLoadTags();
    }
  }, [form.target_type]);

  const suggestions =
    form.target_type === "product_tag" && shopTags && tagFilter.length > 0
      ? shopTags
          .filter((t) => t.toLowerCase().includes(tagFilter.toLowerCase()))
          .slice(0, 8)
      : [];

  const handleTargetValueInput = (e) => {
    const val = e.target.value;
    setForm((p) => ({ ...p, target_value: val }));
    setTagFilter(val);
  };

  const handleSuggestionClick = (tag) => {
    setForm((p) => ({ ...p, target_value: tag }));
    setTagFilter("");
  };

  const handleSubmit = async () => {
    if (!form.target_value.trim()) {
      shopify.toast.show("Target value is required.", { isError: true });
      return;
    }
    setSaving(true);
    const data = await api.createRule({
      option_id: optionId,
      target_type: form.target_type,
      target_value: form.target_value.trim(),
      weight: Number(form.weight) || 1,
    });
    setSaving(false);
    if (data.ok) {
      onAdd(questionId, optionId, data.rule);
      setForm(blankRule());
      setTagFilter("");
    } else {
      shopify.toast.show("Failed to add rule.", { isError: true });
    }
  };

  return (
    <s-box background="subdued" padding="300" borderRadius="base">
      <s-stack direction="block" gap="200">
        <s-grid gridTemplateColumns="1fr 2fr 80px">
          <s-select
            label="Type"
            value={form.target_type}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                target_type: e.target.value,
                target_value: "",
              }))
            }
          >
            <s-option value="product_tag">Product tag</s-option>
            <s-option value="collection_id">Collection</s-option>
            <s-option value="product_id">Product ID</s-option>
          </s-select>
          <s-stack direction="block" gap="100">
            <s-text-field
              label="Value"
              value={form.target_value}
              placeholder={
                form.target_type === "product_tag"
                  ? "finish:matte"
                  : "gid://shopify/..."
              }
              onInput={handleTargetValueInput}
            />
            {suggestions.length > 0 && (
              <s-stack direction="inline" gap="100">
                {suggestions.map((t) => (
                  <s-badge
                    key={t}
                    tone="info"
                    onClick={() => handleSuggestionClick(t)}
                    style={{ cursor: "pointer" }}
                  >
                    {t}
                  </s-badge>
                ))}
              </s-stack>
            )}
            {form.target_type === "product_tag" && shopTags === null && (
              <s-text color="subdued">Loading tag suggestions…</s-text>
            )}
          </s-stack>
          <s-text-field
            label="Weight"
            value={form.weight}
            placeholder="1"
            onInput={(e) => setForm((p) => ({ ...p, weight: e.target.value }))}
          />
        </s-grid>
        <s-stack direction="inline" gap="200">
          <s-button variant="primary" loading={saving} onClick={handleSubmit}>
            Add rule
          </s-button>
          <s-button onClick={onCancel}>Cancel</s-button>
        </s-stack>
      </s-stack>
    </s-box>
  );
};

// ─── OptionRow ───────────────────────────────────────────────────────────────

const OptionRow = ({
  option,
  questionId,
  questionnaire,
  expandedRules,
  shopTags,
  onLoadTags,
  toggleRules,
  onOptionUpdated,
  onOptionDeleted,
  onRuleAdded,
  onRuleDeleted,
}) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    label: option.label,
    next_question_id: option.next_question_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingRule, setAddingRule] = useState(false);

  const otherQuestions = questionnaire.filter((q) => q._id !== questionId);

  const handleSave = async () => {
    if (!form.label.trim()) {
      shopify.toast.show("Option label is required.", { isError: true });
      return;
    }
    setSaving(true);
    const data = await api.updateOption(option._id, {
      label: form.label,
      next_question_id: form.next_question_id || null,
    });
    setSaving(false);
    if (data.ok) {
      onOptionUpdated(questionId, option._id, data.option);
      setEditing(false);
    } else {
      shopify.toast.show("Failed to update option.", { isError: true });
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const data = await api.deleteOption(option._id);
    setDeleting(false);
    if (data.ok) {
      onOptionDeleted(questionId, option._id);
    } else {
      shopify.toast.show("Failed to delete option.", { isError: true });
    }
  };

  const handleDeleteRule = async (ruleId) => {
    const data = await api.deleteRule(ruleId);
    if (data.ok) {
      onRuleDeleted(questionId, option._id, ruleId);
    } else {
      shopify.toast.show("Failed to delete rule.", { isError: true });
    }
  };

  if (editing) {
    return (
      <s-table-row id={option._id}>
        <s-table-cell>
          <s-text-field
            label="Label"
            value={form.label}
            onInput={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
          />
        </s-table-cell>
        <s-table-cell>
          <s-select
            label="Branch to"
            value={form.next_question_id}
            onChange={(e) =>
              setForm((p) => ({ ...p, next_question_id: e.target.value }))
            }
          >
            <s-option value="">Continue in order</s-option>
            {otherQuestions.map((q) => (
              <s-option key={q._id} value={q._id}>
                Q{q.order}: {q.text}
              </s-option>
            ))}
          </s-select>
        </s-table-cell>
        <s-table-cell>—</s-table-cell>
        <s-table-cell>
          <s-stack direction="inline" gap="200">
            <s-button variant="primary" loading={saving} onClick={handleSave}>
              Save
            </s-button>
            <s-button onClick={() => setEditing(false)}>Cancel</s-button>
          </s-stack>
        </s-table-cell>
      </s-table-row>
    );
  }

  const rulesOpen = expandedRules[option._id];
  const nextQ = otherQuestions.find((q) => q._id === option.next_question_id);

  return (
    <>
      <s-table-row id={option._id}>
        <s-table-cell>
          <s-text>{option.label}</s-text>
        </s-table-cell>
        <s-table-cell>
          <s-text color="subdued">
            {nextQ ? `→ Q${nextQ.order}: ${nextQ.text}` : "—"}
          </s-text>
        </s-table-cell>
        <s-table-cell>
          <s-stack direction="inline" gap="100">
            {option.scoring_rules.length === 0 ? (
              <s-text color="subdued">None</s-text>
            ) : (
              option.scoring_rules.map((r) => (
                <s-badge key={r._id} tone="info">
                  {r.target_value} ×{r.weight}
                </s-badge>
              ))
            )}
          </s-stack>
        </s-table-cell>
        <s-table-cell>
          <s-stack direction="inline" gap="200">
            <s-button
              onClick={() => {
                toggleRules(option._id);
                setAddingRule(false);
              }}
            >
              {rulesOpen
                ? "Hide rules"
                : `Rules (${option.scoring_rules.length})`}
            </s-button>
            <s-button onClick={() => setEditing(true)}>Edit</s-button>
            <s-button tone="critical" loading={deleting} onClick={handleDelete}>
              Delete
            </s-button>
          </s-stack>
        </s-table-cell>
      </s-table-row>

      {rulesOpen && (
        <s-table-row id={`${option._id}-rules`}>
          <s-table-cell colSpan="4">
            <s-box padding="300">
              <s-stack direction="block" gap="200">
                {option.scoring_rules.map((r) => (
                  <s-stack
                    key={r._id}
                    direction="inline"
                    gap="200"
                    alignItems="center"
                  >
                    <s-badge
                      tone={
                        r.target_type === "product_tag" ? "success" : "info"
                      }
                    >
                      {r.target_type === "product_tag"
                        ? "tag"
                        : r.target_type === "collection_id"
                          ? "collection"
                          : "product"}
                    </s-badge>
                    <s-text fontWeight="semibold">{r.target_value}</s-text>
                    <s-text color="subdued">weight {r.weight}</s-text>
                    <s-button
                      tone="critical"
                      onClick={() => handleDeleteRule(r._id)}
                    >
                      Remove
                    </s-button>
                  </s-stack>
                ))}

                {addingRule ? (
                  <AddRuleForm
                    questionId={questionId}
                    optionId={option._id}
                    shopTags={shopTags}
                    onLoadTags={onLoadTags}
                    onAdd={(qId, oId, rule) => {
                      onRuleAdded(qId, oId, rule);
                      setAddingRule(false);
                    }}
                    onCancel={() => setAddingRule(false)}
                  />
                ) : (
                  <s-button onClick={() => setAddingRule(true)}>
                    + Add rule
                  </s-button>
                )}
              </s-stack>
            </s-box>
          </s-table-cell>
        </s-table-row>
      )}
    </>
  );
};

// ─── QuestionCard ─────────────────────────────────────────────────────────────

const QuestionCard = ({
  question,
  questionnaire,
  isFirst,
  isLast,
  expandedRules,
  shopTags,
  onLoadTags,
  toggleRules,
  onQuestionUpdated,
  onQuestionDeleted,
  onMoveUp,
  onMoveDown,
  onOptionAdded,
  onOptionUpdated,
  onOptionDeleted,
  onRuleAdded,
  onRuleDeleted,
}) => {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    text: question.text,
    type: question.type,
    is_required: question.is_required,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingOption, setAddingOption] = useState(false);
  const [newOption, setNewOption] = useState(blankOption());
  const [addingOptionSaving, setAddingOptionSaving] = useState(false);

  const handleSaveQuestion = async () => {
    if (!editForm.text.trim()) {
      shopify.toast.show("Question text is required.", { isError: true });
      return;
    }
    setSaving(true);
    const data = await api.updateQuestion(question._id, editForm);
    setSaving(false);
    if (data.ok) {
      onQuestionUpdated(question._id, data.question);
      setEditing(false);
    } else {
      shopify.toast.show("Failed to update question.", { isError: true });
    }
  };

  const handleDeleteQuestion = async () => {
    setDeleting(true);
    const data = await api.deleteQuestion(question._id);
    setDeleting(false);
    if (data.ok) {
      onQuestionDeleted(question._id);
    } else {
      shopify.toast.show("Failed to delete question.", { isError: true });
    }
  };

  const handleAddOption = async () => {
    if (!newOption.label.trim()) {
      shopify.toast.show("Option label is required.", { isError: true });
      return;
    }
    setAddingOptionSaving(true);
    const data = await api.createOption({
      question_id: question._id,
      label: newOption.label,
      next_question_id: newOption.next_question_id || null,
    });
    setAddingOptionSaving(false);
    if (data.ok) {
      onOptionAdded(question._id, data.option);
      setNewOption(blankOption());
      setAddingOption(false);
    } else {
      shopify.toast.show("Failed to add option.", { isError: true });
    }
  };

  const otherQuestions = questionnaire.filter((q) => q._id !== question._id);

  const sectionHeading = editing
    ? `Editing Q${question.order}`
    : `Q${question.order}: ${question.text}`;

  const sectionSubheading = editing
    ? undefined
    : `${question.type === "single_select" ? "Single select" : "Multi select"} · ${
        question.is_required ? "Required" : "Optional"
      } · ${question.options.length} option${question.options.length !== 1 ? "s" : ""}`;

  return (
    <s-section heading={sectionHeading} subheading={sectionSubheading}>
      {!editing && (
        <>
          <s-button slot="primary-action" onClick={() => setEditing(true)}>
            Edit question
          </s-button>
          <s-button
            slot="secondary-actions"
            onClick={onMoveUp}
            disabled={isFirst ? "" : undefined}
          >
            ↑
          </s-button>
          <s-button
            slot="secondary-actions"
            onClick={onMoveDown}
            disabled={isLast ? "" : undefined}
          >
            ↓
          </s-button>
          <s-button
            slot="secondary-actions"
            tone="critical"
            loading={deleting}
            onClick={handleDeleteQuestion}
          >
            Delete
          </s-button>
        </>
      )}

      <s-stack direction="block" gap="300">
        {editing && (
          <s-box background="subdued" padding="300" borderRadius="base">
            <s-stack direction="block" gap="200">
              <s-text-field
                label="Question text"
                value={editForm.text}
                required=""
                onInput={(e) =>
                  setEditForm((p) => ({ ...p, text: e.target.value }))
                }
              />
              <s-grid gridTemplateColumns="1fr 1fr">
                <s-select
                  label="Type"
                  value={editForm.type}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, type: e.target.value }))
                  }
                >
                  <s-option value="single_select">Single select</s-option>
                  <s-option value="multi_select">Multi select</s-option>
                </s-select>
                <s-select
                  label="Required"
                  value={editForm.is_required ? "true" : "false"}
                  onChange={(e) =>
                    setEditForm((p) => ({
                      ...p,
                      is_required: e.target.value === "true",
                    }))
                  }
                >
                  <s-option value="true">Required</s-option>
                  <s-option value="false">Optional</s-option>
                </s-select>
              </s-grid>
              <s-stack direction="inline" gap="200">
                <s-button
                  variant="primary"
                  loading={saving}
                  onClick={handleSaveQuestion}
                >
                  Save
                </s-button>
                <s-button onClick={() => setEditing(false)}>Cancel</s-button>
              </s-stack>
            </s-stack>
          </s-box>
        )}

        {question.options.length > 0 && (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Label</s-table-header>
              <s-table-header listSlot="secondary">Branch to</s-table-header>
              <s-table-header listSlot="labeled">Scoring rules</s-table-header>
              <s-table-header listSlot="labeled">Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {question.options.map((option) => (
                <OptionRow
                  key={option._id}
                  option={option}
                  questionId={question._id}
                  questionnaire={questionnaire}
                  expandedRules={expandedRules}
                  shopTags={shopTags}
                  onLoadTags={onLoadTags}
                  toggleRules={toggleRules}
                  onOptionUpdated={onOptionUpdated}
                  onOptionDeleted={onOptionDeleted}
                  onRuleAdded={onRuleAdded}
                  onRuleDeleted={onRuleDeleted}
                />
              ))}
            </s-table-body>
          </s-table>
        )}

        {question.options.length === 0 && !addingOption && (
          <s-text color="subdued">
            No options yet. Add at least two options.
          </s-text>
        )}

        {addingOption ? (
          <s-box background="subdued" padding="300" borderRadius="base">
            <s-stack direction="block" gap="200">
              <s-grid gridTemplateColumns="1fr 1fr">
                <s-text-field
                  label="Option label"
                  value={newOption.label}
                  placeholder="e.g. Matte"
                  onInput={(e) =>
                    setNewOption((p) => ({ ...p, label: e.target.value }))
                  }
                />
                <s-select
                  label="Branch to (optional)"
                  value={newOption.next_question_id}
                  onChange={(e) =>
                    setNewOption((p) => ({
                      ...p,
                      next_question_id: e.target.value,
                    }))
                  }
                >
                  <s-option value="">Continue in order</s-option>
                  {otherQuestions.map((q) => (
                    <s-option key={q._id} value={q._id}>
                      Q{q.order}: {q.text}
                    </s-option>
                  ))}
                </s-select>
              </s-grid>
              <s-stack direction="inline" gap="200">
                <s-button
                  variant="primary"
                  loading={addingOptionSaving}
                  onClick={handleAddOption}
                >
                  Add option
                </s-button>
                <s-button
                  onClick={() => {
                    setAddingOption(false);
                    setNewOption(blankOption());
                  }}
                >
                  Cancel
                </s-button>
              </s-stack>
            </s-stack>
          </s-box>
        ) : (
          <s-button onClick={() => setAddingOption(true)}>
            + Add option
          </s-button>
        )}
      </s-stack>
    </s-section>
  );
};

// ─── PreviewPanel ─────────────────────────────────────────────────────────────

const PreviewPanel = ({ questionnaire, campaignId, onClose }) => {
  const first = [...questionnaire].sort((a, b) => a.order - b.order)[0];
  const [current, setCurrent] = useState(first);
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [history, setHistory] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);

  const handleSelect = (optionId) => {
    if (current.type === "single_select") {
      setSelectedOptions([optionId]);
    } else {
      setSelectedOptions((prev) =>
        prev.includes(optionId)
          ? prev.filter((id) => id !== optionId)
          : [...prev, optionId]
      );
    }
  };

  const handleNext = () => {
    const newAnswers = [
      ...answers,
      { question_id: current._id, option_ids: selectedOptions },
    ];

    let nextQuestion = null;
    if (current.type === "single_select" && selectedOptions.length === 1) {
      const sel = current.options.find((o) => o._id === selectedOptions[0]);
      if (sel?.next_question_id) {
        nextQuestion =
          questionnaire.find((q) => q._id === sel.next_question_id) || null;
      }
    }
    if (!nextQuestion) {
      const answeredIds = new Set([
        ...answers.map((a) => a.question_id),
        current._id,
      ]);
      nextQuestion =
        [...questionnaire]
          .filter((q) => !answeredIds.has(q._id))
          .sort((a, b) => a.order - b.order)[0] || null;
    }

    setAnswers(newAnswers);
    setHistory((prev) => [...prev, current._id]);
    setCurrent(nextQuestion);
    setSelectedOptions([]);
  };

  const handleBack = () => {
    const prevId = history[history.length - 1];
    const prevQ = questionnaire.find((q) => q._id === prevId);
    const prevAnswer = answers[answers.length - 1];
    setCurrent(prevQ);
    setHistory((prev) => prev.slice(0, -1));
    setAnswers((prev) => prev.slice(0, -1));
    setSelectedOptions(prevAnswer?.option_ids || []);
    setResults(null);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const data = await api.previewCampaign(campaignId, answers);
    setSubmitting(false);
    setResults(data.ok ? data.products : []);
  };

  const handleRestart = () => {
    setCurrent(first);
    setAnswers([]);
    setHistory([]);
    setSelectedOptions([]);
    setResults(null);
  };

  if (results !== null) {
    return (
      <s-section heading="Preview results">
        <s-button slot="secondary-actions" onClick={handleRestart}>
          Restart
        </s-button>
        <s-button slot="secondary-actions" onClick={onClose}>
          Close preview
        </s-button>
        <s-stack direction="block" gap="300">
          {results.length === 0 ? (
            <s-text color="subdued">
              No products matched these answers. Check your scoring rules.
            </s-text>
          ) : (
            <s-grid gridTemplateColumns="1fr 1fr">
              {results.map((p) => (
                <s-box
                  key={p.id}
                  background="subdued"
                  padding="300"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="200">
                    {p.image && (
                      <img
                        src={p.image.url}
                        alt={p.image.altText || p.title}
                        style={{
                          width: "100%",
                          borderRadius: "4px",
                          display: "block",
                        }}
                      />
                    )}
                    <s-text fontWeight="semibold">{p.title}</s-text>
                    {p.price && (
                      <s-text color="subdued">
                        {p.price.currencyCode} {p.price.amount}
                      </s-text>
                    )}
                    <s-text color="subdued">Score: {p.score}</s-text>
                  </s-stack>
                </s-box>
              ))}
            </s-grid>
          )}
        </s-stack>
      </s-section>
    );
  }

  if (!current) {
    return (
      <s-section heading="Quiz complete">
        <s-button slot="secondary-actions" onClick={onClose}>
          Close preview
        </s-button>
        <s-stack direction="block" gap="300">
          <s-text>
            {answers.length} question{answers.length !== 1 ? "s" : ""} answered.
          </s-text>
          <s-stack direction="inline" gap="200">
            {history.length > 0 && (
              <s-button onClick={handleBack}>Back</s-button>
            )}
            <s-button
              variant="primary"
              loading={submitting}
              onClick={handleSubmit}
            >
              Get recommendations
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>
    );
  }

  const progress = `${answers.length + 1} / ${questionnaire.length}`;
  const hint =
    current.type === "single_select" ? "Choose one" : "Choose all that apply";

  return (
    <s-section
      heading={current.text}
      subheading={`Question ${progress} · ${hint}`}
    >
      <s-button slot="secondary-actions" onClick={onClose}>
        Close preview
      </s-button>
      <s-stack direction="block" gap="300">
        <s-stack direction="block" gap="200">
          {current.options.map((option) => (
            <s-button
              key={option._id}
              variant={
                selectedOptions.includes(option._id) ? "primary" : undefined
              }
              onClick={() => handleSelect(option._id)}
            >
              {option.label}
            </s-button>
          ))}
          {current.options.length === 0 && (
            <s-text tone="critical">This question has no options.</s-text>
          )}
        </s-stack>
        <s-stack direction="inline" gap="200">
          {history.length > 0 && <s-button onClick={handleBack}>Back</s-button>}
          <s-button variant="primary" onClick={handleNext}>
            Next
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
};

// ─── QuestionnaireBuilder ─────────────────────────────────────────────────────

const QuestionnaireBuilder = ({ campaignId, onLoad }) => {
  const [questionnaire, setQuestionnaire] = useState([]);
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState(blankQuestion());
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [expandedRules, setExpandedRules] = useState({});
  const [shopTags, setShopTags] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    loadQuestionnaire();
  }, [campaignId]);

  const loadQuestionnaire = async () => {
    setLoading(true);
    const data = await api.load(campaignId);
    setLoading(false);
    if (data.ok) {
      setCampaign(data.campaign);
      setQuestionnaire(data.questionnaire);
      onLoad?.(data.campaign);
    } else {
      shopify.toast.show("Failed to load questionnaire.", { isError: true });
    }
  };

  const loadShopTags = async () => {
    if (shopTags !== null) return;
    const data = await api.productTags();
    setShopTags(data.ok ? data.tags : []);
  };

  const toggleRules = (optionId) =>
    setExpandedRules((p) => ({ ...p, [optionId]: !p[optionId] }));

  const moveQuestion = async (questionId, direction) => {
    const sorted = [...questionnaire].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((q) => q._id === questionId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const q1 = sorted[idx];
    const q2 = sorted[swapIdx];
    const newOrder = [
      { id: q1._id, order: q2.order },
      { id: q2._id, order: q1.order },
    ];

    setQuestionnaire((prev) =>
      prev.map((q) => {
        if (q._id === q1._id) return { ...q, order: q2.order };
        if (q._id === q2._id) return { ...q, order: q1.order };
        return q;
      })
    );

    const result = await api.reorderQuestions(campaign._id, newOrder);
    if (!result.ok) {
      setQuestionnaire((prev) =>
        prev.map((q) => {
          if (q._id === q1._id) return { ...q, order: q1.order };
          if (q._id === q2._id) return { ...q, order: q2.order };
          return q;
        })
      );
      shopify.toast.show("Failed to reorder questions.", { isError: true });
    }
  };

  const handleQuestionAdded = (q) => setQuestionnaire((p) => [...p, q]);
  const handleQuestionUpdated = (qId, updated) =>
    setQuestionnaire((p) => updateQ(p, qId, updated));
  const handleQuestionDeleted = (qId) =>
    setQuestionnaire((p) => p.filter((q) => q._id !== qId));

  const handleOptionAdded = (qId, opt) =>
    setQuestionnaire((p) =>
      updateQ(p, qId, {
        options: [...p.find((q) => q._id === qId).options, opt],
      })
    );
  const handleOptionUpdated = (qId, oId, updated) =>
    setQuestionnaire((p) =>
      updateO(p, qId, oId, {
        label: updated.label,
        next_question_id: updated.next_question_id,
      })
    );
  const handleOptionDeleted = (qId, oId) =>
    setQuestionnaire((p) =>
      updateQ(p, qId, {
        options: p
          .find((q) => q._id === qId)
          .options.filter((o) => o._id !== oId),
      })
    );

  const handleRuleAdded = (qId, oId, rule) =>
    setQuestionnaire((p) =>
      updateO(p, qId, oId, {
        scoring_rules: [
          ...(p.find((q) => q._id === qId)?.options.find((o) => o._id === oId)
            ?.scoring_rules ?? []),
          rule,
        ],
      })
    );
  const handleRuleDeleted = (qId, oId, rId) =>
    setQuestionnaire((p) =>
      updateO(p, qId, oId, {
        scoring_rules:
          p
            .find((q) => q._id === qId)
            ?.options.find((o) => o._id === oId)
            ?.scoring_rules.filter((r) => r._id !== rId) ?? [],
      })
    );

  const handleAddQuestion = async () => {
    if (!newQuestion.text.trim()) {
      shopify.toast.show("Question text is required.", { isError: true });
      return;
    }
    setAddingQuestion(true);
    const data = await api.createQuestion({
      campaign_id: campaignId,
      ...newQuestion,
    });
    setAddingQuestion(false);
    if (data.ok) {
      handleQuestionAdded(data.question);
      setNewQuestion(blankQuestion());
      setShowAddQuestion(false);
    } else {
      shopify.toast.show("Failed to add question.", { isError: true });
    }
  };

  if (loading) {
    return (
      <s-box padding="800">
        <s-stack direction="inline" justifyContent="center">
          <s-spinner size="large" accessibilityLabel="Loading questionnaire" />
        </s-stack>
      </s-box>
    );
  }

  const sortedQuestionnaire = [...questionnaire].sort(
    (a, b) => a.order - b.order
  );

  // Return a fragment so s-section elements are direct children of the caller's s-stack.
  // Wrapping in another s-stack would produce s-stack > s-stack > s-section which
  // App Home web components don't support.
  const addQuestionForm = (
    <s-box background="subdued" padding="400" borderRadius="base">
      <s-stack direction="block" gap="200">
        <s-text-field
          label="Question text"
          value={newQuestion.text}
          placeholder="e.g. What finish do you prefer?"
          required=""
          onInput={(e) =>
            setNewQuestion((p) => ({ ...p, text: e.target.value }))
          }
        />
        <s-grid gridTemplateColumns="1fr 1fr">
          <s-select
            label="Type"
            value={newQuestion.type}
            onChange={(e) =>
              setNewQuestion((p) => ({ ...p, type: e.target.value }))
            }
          >
            <s-option value="single_select">Single select</s-option>
            <s-option value="multi_select">Multi select</s-option>
          </s-select>
          <s-select
            label="Required"
            value={newQuestion.is_required ? "true" : "false"}
            onChange={(e) =>
              setNewQuestion((p) => ({
                ...p,
                is_required: e.target.value === "true",
              }))
            }
          >
            <s-option value="true">Required</s-option>
            <s-option value="false">Optional</s-option>
          </s-select>
        </s-grid>
        <s-stack direction="inline" gap="200">
          <s-button
            variant="primary"
            loading={addingQuestion}
            onClick={handleAddQuestion}
          >
            Add question
          </s-button>
          <s-button
            onClick={() => {
              setShowAddQuestion(false);
              setNewQuestion(blankQuestion());
            }}
          >
            Cancel
          </s-button>
        </s-stack>
      </s-stack>
    </s-box>
  );

  return (
    <>
      {previewOpen && questionnaire.length > 0 && (
        <PreviewPanel
          questionnaire={sortedQuestionnaire}
          campaignId={campaignId}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {!previewOpen && (
        <s-section heading="Questions">
          {questionnaire.length > 0 && (
            <s-button
              slot="secondary-actions"
              onClick={() => setPreviewOpen(true)}
            >
              Preview quiz
            </s-button>
          )}

          {/* Empty state */}
          {questionnaire.length === 0 && !showAddQuestion && (
            <s-empty-state heading="No questions yet">
              <s-text slot="subheading">
                Add questions to build your recommendation quiz.
              </s-text>
              <s-button
                slot="primary-action"
                variant="primary"
                onClick={() => setShowAddQuestion(true)}
              >
                Add question
              </s-button>
            </s-empty-state>
          )}

          {/* Add form for the very first question */}
          {questionnaire.length === 0 && showAddQuestion && addQuestionForm}

          {/* When questions exist, show count + "Add question" button as body content */}
          {questionnaire.length > 0 && (
            <s-stack direction="block" gap="300">
              <s-text color="subdued">
                {questionnaire.length} question
                {questionnaire.length !== 1 ? "s" : ""}
              </s-text>
              {!showAddQuestion && (
                <s-button onClick={() => setShowAddQuestion(true)}>
                  + Add question
                </s-button>
              )}
            </s-stack>
          )}
        </s-section>
      )}

      {!previewOpen &&
        sortedQuestionnaire.map((question, idx) => (
          <QuestionCard
            key={question._id}
            question={question}
            questionnaire={questionnaire}
            isFirst={idx === 0}
            isLast={idx === sortedQuestionnaire.length - 1}
            expandedRules={expandedRules}
            shopTags={shopTags}
            onLoadTags={loadShopTags}
            toggleRules={toggleRules}
            onQuestionUpdated={handleQuestionUpdated}
            onQuestionDeleted={handleQuestionDeleted}
            onMoveUp={() => moveQuestion(question._id, "up")}
            onMoveDown={() => moveQuestion(question._id, "down")}
            onOptionAdded={handleOptionAdded}
            onOptionUpdated={handleOptionUpdated}
            onOptionDeleted={handleOptionDeleted}
            onRuleAdded={handleRuleAdded}
            onRuleDeleted={handleRuleDeleted}
          />
        ))}

      {/* Add form appears below all question cards when at least one question exists */}
      {!previewOpen && questionnaire.length > 0 && showAddQuestion && (
        <s-section heading="New question">{addQuestionForm}</s-section>
      )}
    </>
  );
};

export default QuestionnaireBuilder;
