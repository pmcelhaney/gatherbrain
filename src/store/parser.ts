import matter from 'gray-matter';

export interface ParsedFile {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function parseEntityFile(content: string): ParsedFile {
  const parsed = matter(content);

  return {
    frontmatter: parsed.data,
    body: parsed.content ?? '',
  };
}

export function serializeEntityFile(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  if (Object.keys(frontmatter).length === 0) {
    return body;
  }

  return matter.stringify(body, frontmatter).replace(/\n$/, '');
}
