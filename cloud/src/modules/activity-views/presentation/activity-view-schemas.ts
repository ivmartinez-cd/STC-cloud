export const createActivityViewSchema = {
  body: {
    type: "object",
    required: ["name", "filters"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 80 },
      filters: { type: "object" },
    },
  },
};

export const idParamSchema = {
  params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
};
