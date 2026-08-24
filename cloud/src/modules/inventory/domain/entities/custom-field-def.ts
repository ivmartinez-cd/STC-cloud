export type CustomFieldType = "text" | "number" | "date" | "select" | "boolean";

export interface CustomFieldDef {
  id: string;
  clientId: string | null;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[] | null;
  position: number;
  createdAt: Date;
}
