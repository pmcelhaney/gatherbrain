import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Handlebars from 'handlebars';

const defaultTemplateDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'default-config',
  'templates'
);

const compiledTemplates = new Map();

function templatePathForName(name) {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(name)) {
    throw new Error(`unsupported template ${name}`);
  }

  return path.join(defaultTemplateDirectory, `${name}.hbs`);
}

function compiledTemplate(name) {
  if (compiledTemplates.has(name)) {
    return compiledTemplates.get(name);
  }

  const template = Handlebars.compile(readFileSync(templatePathForName(name), 'utf8'), {
    noEscape: true,
    strict: true
  });

  compiledTemplates.set(name, template);
  return template;
}

export function renderTemplate(name, viewModel) {
  return compiledTemplate(name)(viewModel).replace(/\r?\n$/u, '');
}

export function renderTemplateLines(name, viewModel) {
  const rendered = renderTemplate(name, viewModel);

  return rendered.length > 0 ? rendered.split(/\r?\n/u) : [];
}
