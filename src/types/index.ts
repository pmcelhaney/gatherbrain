/** Supported property value types for schema fields. */
export type PropertyType =
  | 'string'
  | 'text'
  | 'boolean'
  | 'number'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'relation'
  | 'relation-list';

/** Shared configuration available on every schema property. */
export interface BaseProperty {
  type: PropertyType;
  label?: string;
  required?: boolean;
  defaultValue?: unknown;
}

/** Property whose value must be one of a fixed set of string options. */
export interface EnumProperty extends BaseProperty {
  type: 'enum';
  options: string[];
}

/** Property that references a single related entity. */
export interface RelationProperty extends BaseProperty {
  type: 'relation';
  schema: string | 'any';
}

/** Property that references a list of related entities. */
export interface RelationListProperty extends BaseProperty {
  type: 'relation-list';
  schema: string | 'any';
}

/** Union of all supported property definition shapes. */
export type PrimitivePropertyType = Exclude<
  PropertyType,
  'enum' | 'relation' | 'relation-list'
>;

export interface PrimitiveProperty extends BaseProperty {
  type: PrimitivePropertyType;
}

export type PropertyDefinition =
  | PrimitiveProperty
  | EnumProperty
  | RelationProperty
  | RelationListProperty;

/** Schema definition used to describe entities stored in the vault. */
export interface Schema {
  name: string;
  description?: string;
  folder: string;
  properties: Record<string, PropertyDefinition>;
  defaultValues?: Record<string, unknown>;
  fullPageTemplate?: string;
  summaryTemplate?: string;
  pickerTemplate?: string;
}

/** Parsed entity file and its identifying metadata. */
export interface Entity {
  id: string;
  schema: string;
  title: string;
  filePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

/** Reference to a wiki-style link found in content. */
export interface WikiLink {
  title: string;
  resolvedId?: string;
}
