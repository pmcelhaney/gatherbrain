import { type Schema } from '../types/index';

export class SchemaRegistry {
  private schemas: Map<string, Schema> = new Map();

  load(schemas: Schema[]): void {
    for (const schema of schemas) {
      this.schemas.set(schema.name, schema);
    }
  }

  get(name: string): Schema | undefined {
    return this.schemas.get(name);
  }

  getAll(): Schema[] {
    return Array.from(this.schemas.values());
  }

  getFolder(schemaName: string): string {
    const schema = this.schemas.get(schemaName);
    return schema?.folder ?? `Entities/${schemaName}`;
  }
}
