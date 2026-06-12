import { type Entity } from '../types/index';

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-');
}

export function capturedNoteFilePath(
  sourceEntity: Entity,
  createdAt: Date,
  title: string,
): string {
  const year = createdAt.getFullYear();
  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const day = String(createdAt.getDate()).padStart(2, '0');
  const hours = String(createdAt.getHours()).padStart(2, '0');
  const minutes = String(createdAt.getMinutes()).padStart(2, '0');
  const seconds = String(createdAt.getSeconds()).padStart(2, '0');

  const timestamp = `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
  const slug = slugify(title);

  const sourceFolder = sourceEntity.filePath.split('/').slice(0, -1).join('/');
  const fileName = `${timestamp}-${slug}.md`;

  return sourceFolder ? `${sourceFolder}/${fileName}` : fileName;
}
