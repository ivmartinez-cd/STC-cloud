export const submitFeedbackSchema = {
  body: {
    type: "object",
    required: ["type", "title", "description"],
    additionalProperties: false,
    properties: {
      type: { type: "string", enum: ["bug", "enhancement"] },
      title: { type: "string", minLength: 3, maxLength: 200 },
      description: { type: "string", minLength: 10, maxLength: 5000 },
      image_url: { type: "string", maxLength: 500 },
    },
  },
};

export const updateStatusSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string", format: "uuid" } },
  },
  body: {
    type: "object",
    required: ["status"],
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["open", "in_progress", "closed"] },
    },
  },
};
